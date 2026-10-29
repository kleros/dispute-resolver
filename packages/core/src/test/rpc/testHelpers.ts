import { createPublicClient, custom, encodeFunctionData, encodeFunctionResult, numberToHex, pad } from "viem";
import type { Abi, ContractFunctionArgs, ContractFunctionName, ContractFunctionReturnType } from "viem";
import { vi } from "vitest";
import type { Address, Hex, ReadClient } from "../../types";

/** A log as a JSON-RPC node returns it. */
export interface RpcLog {
  readonly address: Hex;
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly blockNumber: Hex;
  readonly blockHash: Hex;
  readonly transactionHash: Hex;
  readonly transactionIndex: Hex;
  readonly logIndex: Hex;
  readonly removed: boolean;
}

/** One topic position of an `eth_getLogs` filter: any value, one value, or any of several. */
export type TopicFilter = string | readonly string[] | null;

/** The `eth_getLogs` filter the fake node received, with block numbers decoded. */
export interface LogsRequest {
  readonly address: string;
  readonly topics: readonly TopicFilter[];
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

/** What the fake node answers to one `eth_getLogs` request: logs, or an error to throw. */
export type LogsAnswer = readonly RpcLog[] | Error;

/** The key a fake node files an `eth_call` answer under: target and calldata, lowercase. */
export function callKey(to: string, data: Hex): string {
  return `${to}:${data}`.toLowerCase();
}

/** A log as a node returns it, from the fields a recording keeps; without a recorded hash, one unique to its block and log index. */
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

/** A JSON-RPC error as a node reports it: an `Error` with a numeric `code`. */
export function rpcError(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** The node's answer when the range is wider than `maxRange` blocks, like Infura's 10,000-result cap. */
export function rangeRefusal(): Error {
  return rpcError(-32005, "query returned more than 10000 results");
}

export function asLogsRequest(params: unknown): LogsRequest {
  const [filter] = params as [{ address: string; topics?: TopicFilter[]; fromBlock: Hex; toBlock: Hex }];
  return { address: filter.address, topics: filter.topics ?? [], fromBlock: BigInt(filter.fromBlock), toBlock: BigInt(filter.toBlock) };
}

function topicMatches(filter: TopicFilter | undefined, topic: Hex | undefined): boolean {
  if (filter === undefined || filter === null) return true;
  if (topic === undefined) return false;
  const wanted = typeof filter === "string" ? [filter] : filter;
  return wanted.some((value) => value.toLowerCase() === topic.toLowerCase());
}

/** Whether `log` matches the filter as a node applies it: address, block range and every topic (an array topic matches any of its values). */
export function matchesFilter(log: RpcLog, request: LogsRequest): boolean {
  const block = BigInt(log.blockNumber);
  return (
    log.address.toLowerCase() === request.address.toLowerCase() &&
    request.topics.every((topic, index) => topicMatches(topic, log.topics[index])) &&
    block >= request.fromBlock &&
    block <= request.toBlock
  );
}

/** A node holding `logs` that refuses any `eth_getLogs` range wider than `maxRange` blocks. */
export function cappedNode(logs: readonly RpcLog[], maxRange: bigint): (request: LogsRequest) => Promise<LogsAnswer> {
  return (request) => Promise.resolve(request.toBlock - request.fromBlock + 1n > maxRange ? rangeRefusal() : logs.filter((log) => matchesFilter(log, request)));
}

/**
 * A `ReadClient` over a fake node, with viem's own retries off so every request reaches `answer` once. Records each
 * `eth_getLogs` filter in `requests`.
 */
export function fakeLogsClient(answer: (request: LogsRequest) => Promise<LogsAnswer>): { client: ReadClient; requests: LogsRequest[] } {
  const requests: LogsRequest[] = [];
  const request = async ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    if (method !== "eth_getLogs") throw rpcError(-32601, `unexpected method ${method}`);
    const logsRequest = asLogsRequest(params);
    requests.push(logsRequest);
    const result = await answer(logsRequest);
    if (result instanceof Error) throw result;
    return result;
  };
  return { client: createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }), requests };
}

/** A JSON-RPC error as the node sent it. */
export interface RpcErrorBody {
  readonly code: number;
  readonly message: string;
}

/** The answer to one `eth_call`: raw return data, the node's JSON-RPC error, or an error the transport throws as it is. */
export type CallReply = { readonly result: Hex } | { readonly error: RpcErrorBody | Error };

export interface FakeNodeSpec {
  readonly head: bigint;
  /** `eth_call` answers keyed by `callKey`. A call without an answer fails as a transport error. */
  readonly calls?: Iterable<readonly [string, CallReply]>;
  readonly logs?: readonly RpcLog[];
  /** Block number (hex) → timestamp (hex). A block missing here is answered with `null` (block not found). */
  readonly timestamps?: Readonly<Record<string, Hex>>;
  /** Refuses any `eth_getLogs` range wider than this many blocks, like a capped provider. */
  readonly maxRange?: bigint;
  /** Thrown for every request of this JSON-RPC method, as the transport would. */
  readonly failing?: Readonly<Partial<Record<string, Error>>>;
  /** `eth_getStorageAt` words keyed by `storageKey`; any other slot reads as zero, as on a node. */
  readonly storage?: ReadonlyMap<string, Hex>;
}

/** The key a fake node files a storage word under: the contract, lowercase, and the slot as a number. */
export function storageKey(address: string, slot: Hex): string {
  return `${address.toLowerCase()}:${BigInt(slot).toString()}`;
}

/** Every request the fake node received. */
export interface NodeRequests {
  readonly methods: string[];
  /** `callKey` of every `eth_call`. */
  readonly calls: string[];
  readonly logs: LogsRequest[];
  readonly blocks: bigint[];
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
  input: CallInput<TAbi, TName> & { readonly error?: RpcErrorBody },
): [string, CallReply] {
  const abi: Abi = input.abi;
  const data = calldata({ abi, functionName: input.functionName, args: input.args as readonly unknown[] | undefined });
  return [callKey(input.to, data), { error: input.error ?? { code: 3, message: "execution reverted" } }];
}

/** A `ReadClient` over a fake node, viem retries off so every request reaches the node once. */
export function fakeNode(spec: FakeNodeSpec): { readonly client: ReadClient; readonly requests: NodeRequests } {
  const calls = new Map(spec.calls ?? []);
  const requests: NodeRequests = { methods: [], calls: [], logs: [], blocks: [] };
  const respond = (method: string, params: unknown): unknown => {
    switch (method) {
      case "eth_blockNumber":
        return numberToHex(spec.head);
      case "eth_call": {
        const [call] = params as [{ to: string; data: Hex }];
        const key = callKey(call.to, call.data);
        requests.calls.push(key);
        const reply = calls.get(key);
        if (reply === undefined) throw rpcError(-32099, `no answer recorded for ${key}`);
        if (!("error" in reply)) return reply.result;
        throw reply.error instanceof Error ? reply.error : rpcError(reply.error.code, reply.error.message);
      }
      case "eth_getLogs": {
        const logsRequest = asLogsRequest(params);
        requests.logs.push(logsRequest);
        if (spec.maxRange !== undefined && logsRequest.toBlock - logsRequest.fromBlock + 1n > spec.maxRange) throw rangeRefusal();
        return (spec.logs ?? []).filter((log) => matchesFilter(log, logsRequest));
      }
      case "eth_getStorageAt": {
        const [address, slot] = params as [string, Hex];
        return spec.storage?.get(storageKey(address, slot)) ?? pad("0x", { size: 32 });
      }
      case "eth_getBlockByNumber": {
        const [number] = params as [Hex];
        requests.blocks.push(BigInt(number));
        const timestamp = spec.timestamps?.[number];
        return timestamp === undefined ? null : { number, timestamp, hash: `0x${"cd".repeat(32)}` };
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

/** One JSON-RPC call as the fake endpoint receives it. */
export interface JsonRpcCall {
  readonly id: number;
  readonly method: string;
  readonly params?: unknown;
}

/**
 * What the fake endpoint answers to one call: a JSON-RPC result, a JSON-RPC error, an HTTP status, or nothing. An HTTP
 * request carrying several calls (a batch) gets the HTTP status or the silence of its first call.
 */
export type Reply =
  { readonly result: unknown } | { readonly error: { readonly code: number; readonly message: string; readonly data?: unknown } } | { readonly status: number } | "hang";

export interface FakeEndpoint {
  /** Each HTTP request: its URL, the JSON-RPC calls in its body and when it was sent. */
  readonly posts: { readonly url: string; readonly calls: readonly JsonRpcCall[]; readonly at: number }[];
}

/** The JSON-RPC calls sent to a fake endpoint, across every HTTP request. */
export function rpcCalls(endpoint: FakeEndpoint): JsonRpcCall[] {
  return endpoint.posts.flatMap((post) => post.calls);
}

/** The block range of an `eth_getLogs` call sent to a fake endpoint. */
export function logsRange(call: JsonRpcCall): { readonly fromBlock: bigint; readonly toBlock: bigint } {
  const [filter] = call.params as [{ fromBlock: Hex; toBlock: Hex }];
  return { fromBlock: BigInt(filter.fromBlock), toBlock: BigInt(filter.toBlock) };
}

/** A settled response without a body stream, so fake timers see every step of viem's response handling. */
function respond(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const contentType = typeof body === "string" ? "text/plain" : "application/json";
  const response = {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: new Headers({ "Content-Type": contentType }),
    json: () => Promise.resolve(JSON.parse(text) as unknown),
    text: () => Promise.resolve(text),
  };
  return response as unknown as Response;
}

function hang(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => {
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    });
  });
}

/** Replaces the global fetch with a JSON-RPC endpoint answering each call with `reply`. No network is touched. */
export function stubEndpoint(reply: (call: JsonRpcCall) => Reply | Promise<Reply>): FakeEndpoint {
  const posts: FakeEndpoint["posts"] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as JsonRpcCall | JsonRpcCall[];
    const calls = Array.isArray(body) ? body : [body];
    posts.push({ url, calls, at: Date.now() });
    const replies = await Promise.all(calls.map(async (call) => ({ call, reply: await reply(call) })));
    const first = replies[0]?.reply;
    if (first === "hang") return hang(init.signal);
    if (first !== undefined && typeof first === "object" && "status" in first) return respond(first.status, "unavailable");
    const answers = replies.map(({ call, reply: answer }) => ({ jsonrpc: "2.0", id: call.id, ...(answer as object) }));
    return respond(200, Array.isArray(body) ? answers : answers[0]);
  });
  return { posts };
}
