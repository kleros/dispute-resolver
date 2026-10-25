/**
 * Test-only fake node, bindings and detections for the appeals module. The fake node answers `eth_blockNumber`,
 * `eth_call` from answers keyed by target and calldata, and `eth_getLogs` from a log list with topic filtering (an
 * array topic matches any of its values, as a node does).
 */
import { createPublicClient, custom, encodeFunctionData, encodeFunctionResult, numberToHex, pad } from "viem";
import type { Abi, ContractFunctionArgs, ContractFunctionName, ContractFunctionReturnType } from "viem";
import { SELECTORS } from "../../abi";
import type { ProbeSignature } from "../../abi/types";
import type { ArbitratedBinding } from "../../disputes/types";
import { classifySelectors } from "../../families";
import type { FamilyDetection } from "../../families/types";
import { toRegistryAddress } from "../../registry";
import { callKey, rpcError, type RpcLog } from "../rpc/testHelpers";
import type { Address, ChainId, Hex, ReadClient } from "../../types";

export { recordedDetection } from "../families/testHelpers";
export { callKey, rpcError, type RpcLog } from "../rpc/testHelpers";

/** The answer to one `eth_call`: raw return data, or the node's JSON-RPC error. */
export type CallReply = { readonly result: Hex } | { readonly error: { readonly code: number; readonly message: string } };

/** One topic position of an `eth_getLogs` filter: any value, one value, or any of several. */
export type TopicFilter = Hex | readonly Hex[] | null;

/** The `eth_getLogs` filter the fake node received, with block numbers decoded. */
export interface LogsFilter {
  readonly address: string;
  readonly topics: readonly TopicFilter[];
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

export interface FakeNodeSpec {
  readonly head: bigint;
  /** `eth_call` answers keyed by `callKey`. A call without an answer fails as a transport error. */
  readonly calls?: Iterable<readonly [string, CallReply]>;
  readonly logs?: readonly RpcLog[];
  /** Refuses any `eth_getLogs` range wider than this many blocks, like a capped provider. */
  readonly maxRange?: bigint;
  /** Thrown for every request of this JSON-RPC method, as the transport would. */
  readonly failing?: Readonly<Partial<Record<string, Error>>>;
}

/** Every request the fake node received. */
export interface NodeRequests {
  readonly methods: string[];
  /** `callKey` of every `eth_call`. */
  readonly calls: string[];
  readonly logs: LogsFilter[];
}

interface CallInput<TAbi extends Abi, TName extends ContractFunctionName<TAbi, "view" | "pure">> {
  readonly to: Address;
  readonly abi: TAbi;
  readonly functionName: TName;
  readonly args?: ContractFunctionArgs<TAbi, "view" | "pure", TName>;
}

function calldata(input: { readonly abi: Abi; readonly functionName: string; readonly args?: readonly unknown[] }): Hex {
  return encodeFunctionData(input as Parameters<typeof encodeFunctionData>[0]);
}

/** The key and encoded answer of a synthetic call. */
export function answer<const TAbi extends Abi, TName extends ContractFunctionName<TAbi, "view" | "pure">>(
  input: CallInput<TAbi, TName> & { readonly result: ContractFunctionReturnType<TAbi, "view" | "pure", TName> },
): [string, CallReply] {
  // Encoded against the widened ABI: the generic parameters are already checked at the call site.
  const abi: Abi = input.abi;
  const data = calldata({ abi, functionName: input.functionName, args: input.args as readonly unknown[] | undefined });
  return [callKey(input.to, data), { result: encodeFunctionResult({ abi, functionName: input.functionName, result: input.result }) }];
}

/** The key of a synthetic call answered with a node error, by default a revert. */
export function reverting<const TAbi extends Abi, TName extends ContractFunctionName<TAbi, "view" | "pure">>(
  input: CallInput<TAbi, TName> & { readonly error?: { readonly code: number; readonly message: string } },
): [string, CallReply] {
  const abi: Abi = input.abi;
  const data = calldata({ abi, functionName: input.functionName, args: input.args as readonly unknown[] | undefined });
  return [callKey(input.to, data), { error: input.error ?? { code: 3, message: "execution reverted" } }];
}

function asLogsFilter(params: unknown): LogsFilter {
  const [filter] = params as [{ address: string; topics?: TopicFilter[]; fromBlock: Hex; toBlock: Hex }];
  return { address: filter.address, topics: filter.topics ?? [], fromBlock: BigInt(filter.fromBlock), toBlock: BigInt(filter.toBlock) };
}

function topicMatches(filter: TopicFilter | undefined, topic: Hex | undefined): boolean {
  if (filter === undefined || filter === null) return true;
  if (topic === undefined) return false;
  const wanted = typeof filter === "string" ? [filter] : filter;
  return wanted.some((value) => value.toLowerCase() === topic.toLowerCase());
}

function matches(log: RpcLog, filter: LogsFilter): boolean {
  const block = BigInt(log.blockNumber);
  return (
    log.address.toLowerCase() === filter.address.toLowerCase() &&
    filter.topics.every((topic, index) => topicMatches(topic, log.topics[index])) &&
    block >= filter.fromBlock &&
    block <= filter.toBlock
  );
}

/** A `ReadClient` over a fake node, viem retries off so every request reaches the node once. */
export function fakeNode(spec: FakeNodeSpec): { readonly client: ReadClient; readonly requests: NodeRequests } {
  const calls = new Map(spec.calls ?? []);
  const requests: NodeRequests = { methods: [], calls: [], logs: [] };
  const respond = (method: string, params: unknown): unknown => {
    switch (method) {
      case "eth_blockNumber":
        return numberToHex(spec.head);
      case "eth_call": {
        const [call] = params as [{ to: string; data: Hex }];
        const key = callKey(call.to, call.data);
        requests.calls.push(key);
        const reply = calls.get(key);
        if (reply === undefined) throw rpcError(-32000, `no answer for ${key}`);
        if ("error" in reply) throw rpcError(reply.error.code, reply.error.message);
        return reply.result;
      }
      case "eth_getLogs": {
        const filter = asLogsFilter(params);
        requests.logs.push(filter);
        if (spec.maxRange !== undefined && filter.toBlock - filter.fromBlock + 1n > spec.maxRange) throw rpcError(-32005, "query returned more than 10000 results");
        return (spec.logs ?? []).filter((log) => matches(log, filter));
      }
      default:
        throw rpcError(-32601, `unexpected method ${method}`);
    }
  };
  const request = ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    requests.methods.push(method);
    const failure = spec.failing?.[method];
    if (failure !== undefined) return Promise.reject(failure);
    try {
      return Promise.resolve(respond(method, params));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };
  return { client: createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }), requests };
}

/** A log as a node returns it, from the fields a recording keeps. */
export function rpcLog(input: {
  readonly address: string;
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly blockNumber: bigint | number;
  readonly logIndex: number;
  readonly transactionHash?: Hex;
}): RpcLog {
  const blockNumber = BigInt(input.blockNumber);
  return {
    address: input.address.toLowerCase() as Hex,
    topics: input.topics,
    data: input.data,
    blockNumber: numberToHex(blockNumber),
    blockHash: pad(numberToHex(blockNumber), { size: 32 }),
    transactionHash: input.transactionHash ?? pad(numberToHex(blockNumber * 1_000n + BigInt(input.logIndex)), { size: 32 }),
    transactionIndex: "0x0",
    logIndex: numberToHex(input.logIndex),
    removed: false,
  };
}

/**
 * A binding as `disputes.lookupDispute` creates it. The brand is only reachable through `disputes`, whose node reads
 * are not part of these unit tests, so the test double casts once here.
 */
export function testBinding(fields: { readonly chainId?: ChainId; readonly disputeId: bigint; readonly arbitrated: string; readonly arbitrator?: string }): ArbitratedBinding {
  const binding = {
    chainId: fields.chainId ?? 1,
    disputeId: fields.disputeId,
    arbitrator: toRegistryAddress(fields.arbitrator ?? "0x988b3a538b618c7a603e1c11ab82cd16dbe28069"),
    arbitrated: toRegistryAddress(fields.arbitrated),
  };
  return binding as unknown as ArbitratedBinding;
}

/** A detection of `arbitrable` whose code carries exactly the probe selectors of `signatures`, classified by `families`. */
export function detectionFor(arbitrable: string, signatures: readonly ProbeSignature[], chainId: ChainId = 1): FamilyDetection {
  const selectors = signatures.map((signature) => SELECTORS[signature]);
  const { family, capabilities } = classifySelectors(new Set(selectors));
  return { chainId, arbitrable: toRegistryAddress(arbitrable), family, writeFamily: family, capabilities, realityProxy: null, implementation: null };
}

/** Probe signatures of each family's typical code. */
export const FAMILY_SIGNATURES = {
  "idr-v2": ["externalIDtoLocalID(uint256)", "submitEvidence(uint256,string)", "fundAppeal(uint256,uint256)", "getTotalWithdrawableAmount(uint256,address,uint256)"],
  "idr-v1": ["externalIDtoLocalID(uint256)", "submitEvidence(uint256,string)", "fundAppeal(uint256,uint256)", "getTotalWithdrawableAmount(uint256,address,uint256[])"],
  "idr-legacy": ["externalIDtoLocalID(uint256)", "submitEvidence(uint256,string)", "fundAppeal(uint256,uint8)"],
  "escrow-v1": ["disputeIDtoTransactionID(uint256)", "submitEvidence(uint256,string)"],
  governor: ["submitEvidence(string)", "fundAppeal(uint256)", "getCurrentSessionNumber()"],
  "view-only": [],
} as const satisfies Readonly<Record<string, readonly ProbeSignature[]>>;
