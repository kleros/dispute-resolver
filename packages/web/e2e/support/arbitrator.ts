import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, encodeFunctionResult, parseAbi, toFunctionSelector, type Hex } from "viem";
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
export interface DisputeStruct {
  readonly arbitrated: `0x${string}`;
  readonly period: number;
  readonly lastPeriodChange: bigint;
}

export function isDisputesCall(call: RpcCall, arbitrator: string, id: bigint): boolean {
  return callTarget(call) === arbitrator && callData(call) === encodeFunctionData({ abi: ARBITRATOR_ABI, functionName: "disputes", args: [id] });
}

/** The `disputes(id)` answer of a dispute in court 0 with two options. */
export function disputeStruct({ arbitrated, period, lastPeriodChange }: DisputeStruct): RpcResult {
  const outputs = ARBITRATOR_ABI.find((item) => item.type === "function")?.outputs ?? [];
  return { result: encodeAbiParameters(outputs, [0n, arbitrated, 2n, period, lastPeriodChange, 3n, 0n, false]) };
}

/** Gnosis keeps disputes in a mapping: an ID that was never created reads as a zeroed struct. */
export const NEVER_CREATED_ON_GNOSIS: RpcResult = { result: `0x${"0".repeat(64 * 8)}` };

/** How mainnet's node answers `disputes(id)` past the last dispute (recorded, packages/core/src/rpc/failures.ts). */
export const OUT_OF_RANGE_ON_MAINNET: RpcAnswer = { error: { code: -32003, message: "EVM error: InvalidFEOpcode" } };

const CASE_DETAILS_ABI = parseAbi([
  "function getSubcourt(uint96 _subcourtID) view returns (uint256[] children, uint256[4] timesPerPeriod)",
  "function courts(uint256) view returns (uint96 parent, bool hiddenVotes, uint256 minStake, uint256 alpha, uint256 feeForJuror, uint256 jurorsForCourtJump)",
  "function getDispute(uint256 _disputeID) view returns (uint256[] votesLengths, uint256[] tokensAtStakePerJuror, uint256[] totalFeesForJurors, uint256[] votesInEachRound, uint256[] repartitionsInEachRound, uint256[] penaltiesInEachRound)",
  "function currentRuling(uint256 _disputeID) view returns (uint256 ruling)",
]);
const CASE_DETAILS_SELECTORS = new Set<string>(CASE_DETAILS_ABI.map((item) => toFunctionSelector(item)));

/** How Gnosis's node answers `getSubcourt(id)` past the last court (recorded, packages/core/src/rpc/failures.ts). */
export const PAST_THE_LAST_COURT_ON_GNOSIS: RpcAnswer = { error: { code: 3, message: "execution reverted" } };

/**
 * The case page's court and dispute reads on `arbitrator` for dispute `disputeId`: a single court 0 with its periods,
 * three votes in the first round, and ruling 1. Its policy stays unanswered, so the court shows by its ID.
 */
export function caseDetailsAnswers(arbitrator: string, disputeId: bigint): (call: RpcCall) => RpcAnswer | undefined {
  return (call) => {
    const data = callData(call);
    if (callTarget(call) !== arbitrator || data === undefined || !CASE_DETAILS_SELECTORS.has(data.slice(0, 10))) return undefined;
    const decoded = decodeFunctionData({ abi: CASE_DETAILS_ABI, data: data as Hex });
    switch (decoded.functionName) {
      case "getSubcourt":
        if (decoded.args[0] !== 0n) return PAST_THE_LAST_COURT_ON_GNOSIS;
        return { result: encodeFunctionResult({ abi: CASE_DETAILS_ABI, functionName: "getSubcourt", result: [[], [280_800n, 437_400n, 437_400n, 291_600n]] }) };
      case "courts":
        if (decoded.args[0] !== 0n) return undefined;
        return { result: encodeFunctionResult({ abi: CASE_DETAILS_ABI, functionName: "courts", result: [0n, false, 1_000n, 5_000n, 10n ** 18n, 511n] }) };
      case "getDispute":
        if (decoded.args[0] !== disputeId) return undefined;
        return { result: encodeFunctionResult({ abi: CASE_DETAILS_ABI, functionName: "getDispute", result: [[3n], [0n], [0n], [0n], [0n], [0n]] }) };
      case "currentRuling":
        if (decoded.args[0] !== disputeId) return undefined;
        return { result: encodeFunctionResult({ abi: CASE_DETAILS_ABI, functionName: "currentRuling", result: 1n }) };
    }
  };
}
