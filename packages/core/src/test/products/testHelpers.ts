/** Test-only replay of the recorded product funding reads (`products/__fixtures__/funding.json`). */
import { encodeFunctionData, encodeFunctionResult, numberToHex, pad, parseAbi, zeroAddress } from "viem";
import type { Abi, AbiFunction } from "viem";
import recorded from "../../products/__fixtures__/funding.json";
import type { ArbitratedBinding } from "../../disputes/types";
import type { FamilyDetection } from "../../families/types";
import type { Address, Hex, ReadClient } from "../../types";
import { z } from "../../zod";
import { FAMILY_SIGNATURES, detectionFor, testBinding } from "../appeals/testHelpers";
import { callKey, fakeNode, storageKey, type CallReply, type FakeNodeSpec, type NodeRequests } from "../rpc/testHelpers";

const CURATE_REQUEST = [
  "function getRequestInfo(bytes32, uint256) view returns (bool disputed, uint256 disputeID, uint256 submissionTime, bool resolved, address[3] parties, uint256 numberOfRounds, uint8 ruling, address arbitrator)",
  "function getRoundInfo(bytes32, uint256, uint256) view returns (bool appealed, uint256[3] paid, bool[3] hasPaid)",
] as const;

/** What the contracts answer, up to the last field any reader reads; the readers declare their own views of it. */
const ABIS = {
  "poh-v1": parseAbi([
    "function arbitratorDisputeIDToDisputeData(address, uint256) view returns (uint96 challengeID, address submissionID)",
    "function getSubmissionInfo(address) view returns (uint8 status, uint64 submissionTime, uint64 index, bool registered, bool hasVouched, uint256 numberOfRequests)",
    "function getRequestInfo(address, uint256) view returns (bool disputed, bool resolved, bool requesterLost, uint8 currentReason, uint16 nbParallelDisputes, uint16 lastChallengeID, uint16 arbitratorDataID)",
    "function getChallengeInfo(address, uint256, uint256) view returns (uint16 lastRoundID, address challenger, uint256 disputeID)",
    "function getRoundInfo(address, uint256, uint256, uint256) view returns (bool appealed, uint256[3] paidFees, uint8 sideFunded)",
    "function arbitratorDataList(uint256) view returns (address arbitrator)",
  ]),
  "poh-v2": parseAbi([
    "function disputeIdToData(address, uint256) view returns (uint96 requestId, uint96 challengeId, bytes20 humanityId)",
    "function arbitratorDataHistory(uint256) view returns (uint96 metaEvidenceUpdates, address arbitrator)",
  ]),
  atl: parseAbi([
    "function arbitratorDisputeIDToTokenID(address, uint256) view returns (bytes32 key)",
    "function getTokenInfo(bytes32) view returns (string name, string ticker, address addr, string symbolMultihash, uint8 status, uint256 numberOfRequests)",
    ...CURATE_REQUEST,
  ]),
  gtcr: parseAbi([
    "function arbitratorDisputeIDToItem(address, uint256) view returns (bytes32 key)",
    "function getItemInfo(bytes32) view returns (bytes data, uint8 status, uint256 numberOfRequests)",
    ...CURATE_REQUEST,
  ]),
  light: parseAbi([
    "function arbitratorDisputeIDToItemID(address, uint256) view returns (bytes32 key)",
    "function getItemInfo(bytes32) view returns (uint8 status, uint256 numberOfRequests, uint256 sumDeposit)",
    ...CURATE_REQUEST,
  ]),
  bap: parseAbi([
    "function arbitrator() view returns (address arbitrator)",
    "function externalIDtoLocalID(uint256) view returns (uint256 localId)",
    "function disputes(uint256) view returns (bytes arbitratorExtraData, bool isRuled, uint8 ruling, uint256 disputeIDOnArbitratorSide)",
    "function crowdfundingStatus(uint256, address) view returns (uint256[3] paidFees, bool[3] hasPaid, uint256 feeRewards, uint256[3] contributions)",
  ]),
} satisfies Readonly<Record<string, Abi>>;

export type ProductKind = keyof typeof ABIS;

const hex = z
  .string()
  .regex(/^0x[0-9a-f]*$/)
  .transform((value) => value as Hex);
const address = z
  .string()
  .regex(/^0x[0-9a-f]{40}$/)
  .transform((value) => value as Address);
const callSchema = z.object({
  fn: z.string(),
  args: z.array(z.string()),
  values: z.record(z.string(), z.unknown()).optional(),
  revert: z.literal(true).optional(),
  raw: hex.optional(),
});
const caseSchema = z.object({
  label: z.string(),
  arbitrable: address,
  disputeId: z.string(),
  calls: z.partialRecord(z.enum(Object.keys(ABIS) as [ProductKind, ...ProductKind[]]), z.array(callSchema)),
  storage: z.array(z.object({ slot: hex, word: hex })).optional(),
});
const fixtureSchema = z.object({
  chains: z.array(z.object({ chainId: z.number(), readAtBlock: z.number(), arbitrator: address, cases: z.array(caseSchema) })),
});

/** One recorded call: the output fields a reader reads, a revert, or a raw answer. */
export type RecordedCall = z.infer<typeof callSchema>;

export interface ProductCase {
  readonly chainId: number;
  readonly arbitrator: Address;
  readonly label: string;
  readonly arbitrable: Address;
  readonly disputeId: bigint;
  readonly calls: Readonly<Partial<Record<ProductKind, readonly RecordedCall[]>>>;
  readonly storage: readonly { readonly slot: Hex; readonly word: Hex }[];
}

const CASES: ReadonlyMap<string, ProductCase> = new Map(
  fixtureSchema
    .parse(recorded)
    .chains.flatMap((chain) =>
      chain.cases.map((kase): [string, ProductCase] => [
        kase.label,
        { ...kase, chainId: chain.chainId, arbitrator: chain.arbitrator, disputeId: BigInt(kase.disputeId), storage: kase.storage ?? [] },
      ]),
    ),
);

/** The recorded case `label` ("<kind> <dispute ID>"); throws for an unrecorded one, so a typo fails loudly. */
export function productCase(label: string): ProductCase {
  const kase = CASES.get(label);
  if (kase === undefined) throw new Error(`no recorded case ${label}`);
  return kase;
}

function zeroOf(type: string): unknown {
  const array = /^(.+)\[(\d+)\]$/.exec(type);
  if (array !== null) return Array.from({ length: Number(array[2]) }, () => zeroOf(array[1] ?? ""));
  if (type === "bool") return false;
  if (type === "address") return zeroAddress;
  if (type === "string") return "";
  if (type === "bytes") return "0x";
  if (type.startsWith("bytes")) return pad("0x", { size: Number(type.slice(5)) });
  return 0n;
}

function typed(type: string, value: unknown): unknown {
  const array = /^(.+)\[\d+\]$/.exec(type);
  if (array !== null && Array.isArray(value)) return value.map((item) => typed(array[1] ?? "", item));
  return /^u?int\d*$/.test(type) ? BigInt(String(value)) : value;
}

function functionOf(kind: ProductKind, name: string): AbiFunction {
  const item = (ABIS[kind] as readonly AbiFunction[]).find((candidate) => candidate.name === name);
  if (item === undefined) throw new Error(`no ${name} in ${kind}`);
  return item;
}

function encoded(kind: ProductKind, call: RecordedCall): { readonly data: Hex; readonly result: Hex } {
  const item = functionOf(kind, call.fn);
  const args = item.inputs.map((input, index) => typed(input.type, call.args[index]));
  const outputs = item.outputs.map((output) => {
    const value = output.name === undefined ? undefined : call.values?.[output.name];
    return value === undefined ? zeroOf(output.type) : typed(output.type, value);
  });
  return {
    data: encodeFunctionData({ abi: [item], functionName: item.name, args }),
    // A single output is encoded as its value, several as the tuple.
    result: encodeFunctionResult({ abi: [item], functionName: item.name, result: (outputs.length === 1 ? outputs[0] : outputs) as readonly unknown[] }),
  };
}

function reply(kind: ProductKind, call: RecordedCall): CallReply {
  if (call.revert === true) return { error: { code: 3, message: "execution reverted" } };
  return { result: call.raw ?? encoded(kind, call).result };
}

/** The case with the last recorded call of `fn` replaced by `change`'s. */
export function editCall(kase: ProductCase, kind: ProductKind, fn: string, change: (call: RecordedCall) => RecordedCall): ProductCase {
  const calls = kase.calls[kind] ?? [];
  const index = calls.map((call) => call.fn).lastIndexOf(fn);
  if (index < 0) throw new Error(`${kase.label} has no ${kind} ${fn}`);
  return { ...kase, calls: { ...kase.calls, [kind]: calls.map((call, at) => (at === index ? change(call) : call)) } };
}

/** The case with some output fields of the last recorded call of `fn` replaced. */
export function editValues(kase: ProductCase, kind: ProductKind, fn: string, values: Readonly<Record<string, unknown>>): ProductCase {
  return editCall(kase, kind, fn, (call) => ({ ...call, values: { ...call.values, ...values } }));
}

/** The case with the last recorded call of `fn` answered by `change` of its encoded answer. */
export function editRaw(kase: ProductCase, kind: ProductKind, fn: string, change: (result: Hex) => Hex): ProductCase {
  return editCall(kase, kind, fn, (call) => ({ ...call, raw: change(encoded(kind, call).result) }));
}

/** The case with word `index` (from 0) of the last recorded `fn`'s answer set to `value`, which the field's own type may not hold. */
export function editAnswerWord(kase: ProductCase, kind: ProductKind, fn: string, index: number, value: bigint): ProductCase {
  const start = 2 + index * 64;
  return editRaw(kase, kind, fn, (raw) => `0x${raw.slice(2, start)}${numberToHex(value, { size: 32 }).slice(2)}${raw.slice(start + 64)}`);
}

/** The case with argument `index` of the last recorded call of `fn` set to `value`, so a call made with a mutated input is still answered. */
export function editArg(kase: ProductCase, kind: ProductKind, fn: string, index: number, value: string): ProductCase {
  return editCall(kase, kind, fn, (call) => ({ ...call, args: call.args.map((arg, at) => (at === index ? value : arg)) }));
}

export function addCalls(kase: ProductCase, kind: ProductKind, calls: readonly RecordedCall[]): ProductCase {
  return { ...kase, calls: { ...kase.calls, [kind]: [...(kase.calls[kind] ?? []), ...calls] } };
}

/** The case with the storage word read `index`-th replaced by `change` of it. */
export function editWord(kase: ProductCase, index: number, change: (word: bigint) => bigint): ProductCase {
  const storage = kase.storage.map((entry, at) => (at === index ? { ...entry, word: pad(`0x${change(BigInt(entry.word)).toString(16)}`, { size: 32 }) } : entry));
  return { ...kase, storage };
}

/** A fake node answering the case's recorded calls and storage words; anything else fails as a transport error. */
export function productNode(kase: ProductCase, overrides: Partial<FakeNodeSpec> = {}): FakeNodeSpec {
  const calls = Object.entries(kase.calls).flatMap(([kind, list]) =>
    list.map((call): [string, CallReply] => [callKey(kase.arbitrable, encoded(kind as ProductKind, call).data), reply(kind as ProductKind, call)]),
  );
  const storage = new Map(kase.storage.map(({ slot, word }) => [storageKey(kase.arbitrable, slot), word]));
  return { head: 1n, calls, storage, ...overrides };
}

/** The read client, binding and a view-only detection of the case's dispute. */
export function productRead(
  kase: ProductCase,
  overrides: Partial<FakeNodeSpec> = {},
): { readonly client: ReadClient; readonly requests: NodeRequests; readonly binding: ArbitratedBinding; readonly family: FamilyDetection } {
  const { client, requests } = fakeNode(productNode(kase, overrides));
  const binding = testBinding({ chainId: kase.chainId, disputeId: kase.disputeId, arbitrated: kase.arbitrable, arbitrator: kase.arbitrator });
  return { client, requests, binding, family: detectionFor(kase.arbitrable, FAMILY_SIGNATURES["view-only"], kase.chainId) };
}
