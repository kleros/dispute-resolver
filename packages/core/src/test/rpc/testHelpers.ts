import { createPublicClient, custom } from "viem";
import { vi } from "vitest";
import type { Hex, ReadClient } from "../../types";

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

/** The `eth_getLogs` filter the fake node received, with block numbers decoded. */
export interface LogsRequest {
  readonly address: string;
  readonly topics: readonly (string | null)[];
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

/** What the fake node answers to one `eth_getLogs` request: logs, or an error to throw. */
export type LogsAnswer = readonly RpcLog[] | Error;

/** A JSON-RPC error as a node reports it: an `Error` with a numeric `code`. */
export function rpcError(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** The node's answer when the range is wider than `maxRange` blocks, like Infura's 10,000-result cap. */
export function rangeRefusal(): Error {
  return rpcError(-32005, "query returned more than 10000 results");
}

function asLogsRequest(params: unknown): LogsRequest {
  const [filter] = params as [{ address: string; topics?: (string | null)[]; fromBlock: Hex; toBlock: Hex }];
  return { address: filter.address, topics: filter.topics ?? [], fromBlock: BigInt(filter.fromBlock), toBlock: BigInt(filter.toBlock) };
}

/** The logs of `logs` that a node would return for `request`: same address, first topic and block range. */
export function matchingLogs(logs: readonly RpcLog[], request: LogsRequest): RpcLog[] {
  return logs.filter((log) => {
    const block = BigInt(log.blockNumber);
    const topic0 = request.topics[0];
    const sameTopic = topic0 === undefined || topic0 === null || log.topics[0] === topic0;
    return log.address === request.address.toLowerCase() && sameTopic && block >= request.fromBlock && block <= request.toBlock;
  });
}

/** A node holding `logs` that refuses any `eth_getLogs` range wider than `maxRange` blocks. */
export function cappedNode(logs: readonly RpcLog[], maxRange: bigint): (request: LogsRequest) => Promise<LogsAnswer> {
  return (request) => Promise.resolve(request.toBlock - request.fromBlock + 1n > maxRange ? rangeRefusal() : matchingLogs(logs, request));
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
export type Reply = { readonly result: unknown } | { readonly error: { readonly code: number; readonly message: string } } | { readonly status: number } | "hang";

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
