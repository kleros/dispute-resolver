import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  hexToBigInt,
  numberToHex,
  parseAbi,
  toFunctionSelector,
  type Hex,
} from "viem";
import { callData, callTarget, type RpcAnswer, type RpcCall, type RpcResult } from "./network";

// KlerosLiquid answers the specs build themselves, for disputes no recording holds. The addresses and the node messages
// are copied from packages/core (src/chains/table.ts, src/rpc/failures.ts); nothing of core is imported at runtime, since
// its module graph loads jsdom, which Playwright's loader cannot load under every Node version the engines field allows.

/** `CHAINS[1].klerosLiquid`. */
export const MAINNET_ARBITRATOR = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
/** `CHAINS[100].klerosLiquid`. */
export const GNOSIS_ARBITRATOR = "0x9c1da9a04925bdfdedf0f6421bc7eea8305f9002";

export const ARBITRATOR_ABI = parseAbi([
  "function disputes(uint256) view returns (uint96 subcourtID, address arbitrated, uint256 numberOfChoices, uint8 period, uint256 lastPeriodChange, uint256 drawsInRound, uint256 commitsInRound, bool ruled)",
  "event DisputeCreation(uint256 indexed _disputeID, address indexed _arbitrable)",
  "event NewPeriod(uint256 indexed _disputeID, uint8 indexed _period)",
]);

/** The fields of a `disputes(id)` struct a spec sets. */
interface DisputeStruct {
  readonly arbitrated: `0x${string}`;
  readonly period: number;
  readonly lastPeriodChange: bigint;
  /** Whether the arbitrator executed the ruling (default false). */
  readonly ruled?: boolean;
}

export function isDisputesCall(call: RpcCall, arbitrator: string, id: bigint): boolean {
  return callTarget(call) === arbitrator && callData(call) === encodeFunctionData({ abi: ARBITRATOR_ABI, functionName: "disputes", args: [id] });
}

/** The `disputes(id)` answer of a dispute in court 0 with two options. */
export function disputeStruct({ arbitrated, period, lastPeriodChange, ruled = false }: DisputeStruct): RpcResult {
  const outputs = ARBITRATOR_ABI.find((item) => item.type === "function")?.outputs ?? [];
  return { result: encodeAbiParameters(outputs, [0n, arbitrated, 2n, period, lastPeriodChange, 3n, 0n, ruled]) };
}

const ARBITRABLE_ABI = parseAbi(["event Ruling(address indexed _arbitrator, uint256 indexed _disputeID, uint256 _ruling)"]);

/** The ERC-792 `Ruling` event an arbitrable emits when it executes a ruling. */
export const [RULING_TOPIC] = encodeEventTopics({ abi: ARBITRABLE_ABI, eventName: "Ruling" });

interface RulingLog {
  readonly arbitrable: Hex;
  readonly arbitrator: string;
  readonly disputeId: bigint;
  readonly ruling: bigint;
  readonly blockNumber: bigint;
}

/** The raw `Ruling` log of an arbitrable that executed `ruling`, as a node returns it from `eth_getLogs`. */
export function rulingLog({ arbitrable, arbitrator, disputeId, ruling, blockNumber }: RulingLog) {
  return {
    address: arbitrable,
    topics: encodeEventTopics({ abi: ARBITRABLE_ABI, eventName: "Ruling", args: { _arbitrator: arbitrator as Hex, _disputeID: disputeId } }),
    data: encodeAbiParameters([{ type: "uint256" }], [ruling]),
    blockNumber: numberToHex(blockNumber),
    blockHash: `0x${blockNumber.toString(16).padStart(64, "0")}`,
    transactionHash: `0x${"ee".repeat(32)}`,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
}

/** The `eth_getLogs` filter of a call, when it asks for an event with `topic`; `undefined` for any other call. */
export function logFilterFor(call: RpcCall, topic: Hex): { readonly fromBlock: bigint; readonly toBlock: bigint; readonly address: string } | undefined {
  if (call.method !== "eth_getLogs") return undefined;
  const filter = call.params[0] as { address?: string; fromBlock?: Hex; toBlock?: Hex; topics?: readonly (Hex | null)[] } | undefined;
  if (filter?.topics?.[0] !== topic || filter.fromBlock === undefined || filter.toBlock === undefined) return undefined;
  return { fromBlock: hexToBigInt(filter.fromBlock), toBlock: hexToBigInt(filter.toBlock), address: (filter.address ?? "").toLowerCase() };
}

export const [DISPUTE_CREATION_TOPIC] = encodeEventTopics({ abi: ARBITRATOR_ABI, eventName: "DisputeCreation" });

interface CreationLog {
  readonly arbitrator: string;
  readonly id: bigint;
  readonly arbitrable: Hex;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
}

/** The raw `DisputeCreation` log of dispute `id`, as a node returns it from `eth_getLogs`. */
export function creationLog({ arbitrator, id, arbitrable, blockNumber, transactionHash }: CreationLog) {
  return {
    address: arbitrator,
    topics: encodeEventTopics({ abi: ARBITRATOR_ABI, eventName: "DisputeCreation", args: { _disputeID: id, _arbitrable: arbitrable } }),
    data: "0x",
    blockNumber: numberToHex(blockNumber),
    blockHash: `0x${blockNumber.toString(16).padStart(64, "0")}`,
    transactionHash,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
}

/** The synthetic arbitrable of a dispute in `openDisputesRpc`: its ID, as an address. */
function arbitrableOf(id: bigint): Hex {
  return `0x${id.toString(16).padStart(40, "0")}`;
}

/**
 * Mainnet's arbitrator at block `head` with `ids` open: each dispute's creation log in the last 100 blocks and its
 * `disputes(id)` struct in its first period, changed now. No `NewPeriod` logs: none of the disputes reached execution.
 * Everything else, the courts among them, is left unanswered so it fails fast.
 */
export function openDisputesRpc(ids: readonly bigint[], head: bigint): (call: RpcCall) => RpcResult | undefined {
  const logs = ids.map((id) =>
    creationLog({
      arbitrator: MAINNET_ARBITRATOR,
      id,
      arbitrable: arbitrableOf(id),
      blockNumber: head - 100n + (id % 100n),
      transactionHash: `0x${id.toString(16).padStart(64, "0")}`,
    }),
  );
  return (call) => {
    if (call.method === "eth_blockNumber") return { result: numberToHex(head) };
    if (call.method === "eth_getLogs") {
      const filter = call.params[0] as { fromBlock?: Hex; toBlock?: Hex; topics?: readonly (Hex | null)[] } | undefined;
      if (filter?.topics?.[0] !== DISPUTE_CREATION_TOPIC || filter.fromBlock === undefined || filter.toBlock === undefined) return { result: [] };
      const from = hexToBigInt(filter.fromBlock);
      const to = hexToBigInt(filter.toBlock);
      return { result: logs.filter((log) => hexToBigInt(log.blockNumber) >= from && hexToBigInt(log.blockNumber) <= to) };
    }
    const id = ids.find((candidate) => isDisputesCall(call, MAINNET_ARBITRATOR, candidate));
    return id === undefined ? undefined : disputeStruct({ arbitrated: arbitrableOf(id), period: 0, lastPeriodChange: BigInt(Math.floor(Date.now() / 1000)) });
  };
}

/** How mainnet's node answers `disputes(id)` past the last dispute (recorded, packages/core/src/rpc/failures.ts). */
export const OUT_OF_RANGE_ON_MAINNET: RpcAnswer = { error: { code: -32003, message: "EVM error: InvalidFEOpcode" } };

const CASE_DETAILS_ABI = parseAbi([
  "function getSubcourt(uint96 _subcourtID) view returns (uint256[] children, uint256[4] timesPerPeriod)",
  "function courts(uint256) view returns (uint96 parent, bool hiddenVotes, uint256 minStake, uint256 alpha, uint256 feeForJuror, uint256 jurorsForCourtJump)",
  "function getDispute(uint256 _disputeID) view returns (uint256[] votesLengths, uint256[] tokensAtStakePerJuror, uint256[] totalFeesForJurors, uint256[] votesInEachRound, uint256[] repartitionsInEachRound, uint256[] penaltiesInEachRound)",
  "function currentRuling(uint256 _disputeID) view returns (uint256 ruling)",
  "function appealPeriod(uint256 _disputeID) view returns (uint256 start, uint256 end)",
  "function appealCost(uint256 _disputeID, bytes _extraData) view returns (uint256 cost)",
]);
const CASE_DETAILS_SELECTORS = new Set<string>(CASE_DETAILS_ABI.map((item) => toFunctionSelector(item)));

/** How Gnosis's node answers `getSubcourt(id)` past the last court (recorded, packages/core/src/rpc/failures.ts). */
const PAST_THE_LAST_COURT_ON_GNOSIS: RpcAnswer = { error: { code: 3, message: "execution reverted" } };

interface CaseDetails {
  /** The current ruling (default 1). */
  readonly ruling?: bigint;
  /** The appeal period's start and end, and its cost; unanswered without them. */
  readonly appeal?: { readonly start: bigint; readonly end: bigint; readonly cost: bigint };
}

/**
 * The case page's court and dispute reads on `arbitrator` for dispute `disputeId`: a single court 0 with its periods,
 * three votes in the first round, and ruling 1 unless `details` gives another, with the appeal period it gives. Its policy stays unanswered, so the court shows by its ID.
 */
type CaseDetailsCall = ReturnType<typeof decodeFunctionData<typeof CASE_DETAILS_ABI>>;

/** The court reads, which do not depend on the dispute. */
function courtAnswer(decoded: CaseDetailsCall): RpcAnswer | undefined {
  switch (decoded.functionName) {
    case "getSubcourt":
      if (decoded.args[0] !== 0n) return PAST_THE_LAST_COURT_ON_GNOSIS;
      return { result: encodeFunctionResult({ abi: CASE_DETAILS_ABI, functionName: "getSubcourt", result: [[], [280_800n, 437_400n, 437_400n, 291_600n]] }) };
    case "courts":
      if (decoded.args[0] !== 0n) return undefined;
      return { result: encodeFunctionResult({ abi: CASE_DETAILS_ABI, functionName: "courts", result: [0n, false, 1_000n, 5_000n, 10n ** 18n, 511n] }) };
    default:
      return undefined;
  }
}

/** The reads of the dispute itself, already checked to be about it. */
function disputeAnswer(decoded: CaseDetailsCall, { ruling = 1n, appeal }: CaseDetails): RpcAnswer | undefined {
  switch (decoded.functionName) {
    case "getDispute":
      return { result: encodeFunctionResult({ abi: CASE_DETAILS_ABI, functionName: "getDispute", result: [[3n], [0n], [0n], [0n], [0n], [0n]] }) };
    case "currentRuling":
      return { result: encodeFunctionResult({ abi: CASE_DETAILS_ABI, functionName: "currentRuling", result: ruling }) };
    case "appealPeriod":
      return appeal === undefined ? undefined : { result: encodeFunctionResult({ abi: CASE_DETAILS_ABI, functionName: "appealPeriod", result: [appeal.start, appeal.end] }) };
    case "appealCost":
      return appeal === undefined ? undefined : { result: encodeFunctionResult({ abi: CASE_DETAILS_ABI, functionName: "appealCost", result: appeal.cost }) };
    default:
      return undefined;
  }
}

export function caseDetailsAnswers(arbitrator: string, disputeId: bigint, details: CaseDetails = {}): (call: RpcCall) => RpcAnswer | undefined {
  return (call) => {
    const data = callData(call);
    if (callTarget(call) !== arbitrator || data === undefined || !CASE_DETAILS_SELECTORS.has(data.slice(0, 10))) return undefined;
    const decoded = decodeFunctionData({ abi: CASE_DETAILS_ABI, data: data as Hex });
    if (decoded.functionName === "getSubcourt" || decoded.functionName === "courts") return courtAnswer(decoded);
    return decoded.args[0] === disputeId ? disputeAnswer(decoded, details) : undefined;
  };
}
