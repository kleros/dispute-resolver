import { readFileSync } from "node:fs";
import type { BrowserContext, Request, Route } from "@playwright/test";
import { z } from "zod";

// Requests are recognized by their shape, never by host, so the build's configured URLs, which carry API keys, are never
// named, compared or printed here. The build must have the read RPCs and the meta-evidence API configured, as a deploy
// does.

// The `*` of allow-headers never covers `Authorization`, which Atlas requests carry once signed in, so it is named too.
const CORS_HEADERS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "*, authorization" };

const RpcErrorSchema = z.object({ code: z.number(), message: z.string() });

const RecordingSchema = z.object({
  chainId: z.number(),
  disputeId: z.string(),
  readAtBlock: z.number(),
  calls: z.array(z.object({ method: z.string(), params: z.array(z.unknown()), result: z.unknown().optional(), error: RpcErrorSchema.optional() })),
  locator: z.unknown(),
  files: z.array(z.object({ path: z.string(), status: z.number(), body: z.unknown() })),
});

/** What the case page of one dispute read, recorded once from the real services (fixture files under `e2e/app/fixtures`). */
export type Recording = z.infer<typeof RecordingSchema>;

export function loadRecording(url: URL): Recording {
  return RecordingSchema.parse(JSON.parse(readFileSync(url, "utf8")) as unknown);
}

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.number(), z.string()]),
  method: z.string(),
  params: z.array(z.unknown()).optional(),
});

export interface RpcCall {
  readonly method: string;
  readonly params: readonly unknown[];
}

export interface RpcResult {
  readonly result: unknown;
}

export type RpcAnswer = RpcResult | { readonly error: z.infer<typeof RpcErrorSchema> };

export interface JsonAnswer {
  readonly json: unknown;
}

/** A gateway or locator answer: a JSON body, or a status with no body. */
export type HttpAnswer = JsonAnswer | { readonly status: number };

const GraphqlRequestSchema = z.object({ query: z.string(), variables: z.record(z.string(), z.unknown()).optional() });

/**
 * A request to Atlas, recognized by its shape: a GraphQL POST (a JSON body with a `query`), or the multipart upload POST
 * to `…/ipfs/file`. `authorization` is the `Authorization` header the page sent, if any.
 */
export type AtlasRequest =
  | { readonly kind: "graphql"; readonly query: string; readonly variables: Readonly<Record<string, unknown>>; readonly authorization: string | null }
  | { readonly kind: "upload"; readonly authorization: string | null };

/** An Atlas answer: a JSON body, or a text body (the upload's CID). */
export type AtlasAnswer = JsonAnswer | { readonly text: string };

export interface FakeNetworkOptions {
  /** The app's origin: its own files are served by the app's server. */
  readonly appOrigin: string;
  /** The case pages whose recorded reads are answered. */
  readonly recordings?: readonly Recording[];
  /** The spec's own JSON-RPC answers, asked before the recordings; `undefined` leaves a call to them. */
  readonly rpc?: (call: RpcCall) => RpcAnswer | undefined;
  /** The spec's own answers to the meta-evidence locator (by chain and dispute) and the gateway (by path). */
  readonly http?: (request: HttpRequest) => HttpAnswer | undefined;
  /** The locator and gateway requests never answered, as a stalled server does. */
  readonly hold?: (request: HttpRequest) => boolean;
  /** Atlas, served by the spec; without it every Atlas request is aborted, as for any other service. */
  readonly atlas?: (request: AtlasRequest) => AtlasAnswer;
}

/** A GET the page made outside its origin: the locator's query or a gateway path, never the host. */
export type HttpRequest = { readonly kind: "locator"; readonly chainId: string; readonly disputeId: string } | { readonly kind: "gateway"; readonly path: string };

/** What the routes served, as counts and method names only. */
export interface Traffic {
  readonly rpc: RpcCall[];
  readonly rpcUnanswered: string[];
  readonly http: HttpRequest[];
  aborted: number;
}

/** `value` as JSON with object keys sorted, so a recorded call matches a request whatever order its keys were written in. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const members = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`);
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value);
}

function callKey(method: string, params: readonly unknown[]): string {
  return canonical([method, params]);
}

function indexRecordings(recordings: readonly Recording[]) {
  const calls = new Map<string, RpcAnswer>();
  const files = new Map<string, HttpAnswer>();
  const locators = new Map<string, HttpAnswer>();
  for (const recording of recordings) {
    for (const call of recording.calls) calls.set(callKey(call.method, call.params), call.error === undefined ? { result: call.result } : { error: call.error });
    for (const file of recording.files) files.set(file.path, file.status === 200 ? { json: file.body } : { status: file.status });
    locators.set(`${recording.chainId.toString()}:${recording.disputeId}`, { json: recording.locator });
  }
  return { calls, files, locators };
}

function jsonRpcCall(request: Request): z.infer<typeof JsonRpcRequestSchema> | undefined {
  if (request.method() !== "POST") return undefined;
  let body: unknown;
  try {
    body = JSON.parse(request.postData() ?? "");
  } catch {
    return undefined;
  }
  const parsed = JsonRpcRequestSchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}

async function atlasRequestOf(request: Request, url: URL): Promise<AtlasRequest | undefined> {
  if (request.method() !== "POST") return undefined;
  const authorization = await request.headerValue("authorization");
  if (url.pathname.endsWith("/ipfs/file") && (request.headers()["content-type"] ?? "").startsWith("multipart/form-data")) return { kind: "upload", authorization };
  let body: unknown;
  try {
    body = JSON.parse(request.postData() ?? "");
  } catch {
    return undefined;
  }
  const parsed = GraphqlRequestSchema.safeParse(body);
  return parsed.success ? { kind: "graphql", query: parsed.data.query, variables: parsed.data.variables ?? {}, authorization } : undefined;
}

/** The meta-evidence locator is recognized by its query, whatever host the build names. */
function httpRequestOf(url: URL): HttpRequest | undefined {
  const chainId = url.searchParams.get("chainId");
  const disputeId = url.searchParams.get("disputeId");
  if (chainId !== null && disputeId !== null) return { kind: "locator", chainId, disputeId };
  if (url.pathname.startsWith("/ipfs/")) return { kind: "gateway", path: url.pathname };
  return undefined;
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, headers: CORS_HEADERS, contentType: "application/json", body: JSON.stringify(body) });
}

async function answerAtlas(route: Route, answer: AtlasAnswer): Promise<void> {
  if ("json" in answer) await fulfillJson(route, answer.json);
  else await route.fulfill({ status: 200, headers: CORS_HEADERS, contentType: "text/plain", body: answer.text });
}

/**
 * JSON-RPC: the spec's answer, else the recorded one, else a node error (counted as unanswered; `eth_blockNumber`
 * answers the recording's block). Atlas: the spec's answer when it serves Atlas. Locator and gateway: the spec's answer,
 * else the recorded one, else 404. Everything else, the wallet services included, is aborted.
 */
export async function fakeNetwork(context: BrowserContext, options: FakeNetworkOptions): Promise<Traffic> {
  const traffic: Traffic = { rpc: [], rpcUnanswered: [], http: [], aborted: 0 };
  const recorded = indexRecordings(options.recordings ?? []);
  const head = options.recordings?.[0]?.readAtBlock;

  const answerRpc = async (route: Route, id: number | string, call: RpcCall): Promise<void> => {
    traffic.rpc.push(call);
    const answer =
      options.rpc?.(call) ??
      recorded.calls.get(callKey(call.method, call.params)) ??
      (call.method === "eth_blockNumber" && head !== undefined ? { result: `0x${head.toString(16)}` } : undefined) ??
      (call.method === "eth_getBlockByNumber" && call.params[0] === "latest"
        ? { result: { number: "0x1", timestamp: `0x${Math.floor(Date.now() / 1_000).toString(16)}`, hash: `0x${"cd".repeat(32)}`, transactions: [] } }
        : undefined);
    if (answer === undefined) {
      const selector = callData(call)?.slice(0, 10);
      traffic.rpcUnanswered.push(selector === undefined ? call.method : `${call.method} ${selector}`);
      await fulfillJson(route, { jsonrpc: "2.0", id, error: { code: -32000, message: "Not in the test's answers." } });
      return;
    }
    await fulfillJson(route, { jsonrpc: "2.0", id, ...answer });
  };

  const answerHttp = async (route: Route, request: HttpRequest): Promise<void> => {
    traffic.http.push(request);
    if (options.hold?.(request) === true) return;
    const answer = options.http?.(request) ?? (request.kind === "locator" ? recorded.locators.get(`${request.chainId}:${request.disputeId}`) : recorded.files.get(request.path));
    if (answer === undefined) {
      await route.fulfill({ status: 404, headers: CORS_HEADERS, body: "" });
      return;
    }
    if ("json" in answer) await fulfillJson(route, answer.json);
    else await route.fulfill({ status: answer.status, headers: CORS_HEADERS, body: "" });
  };

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === options.appOrigin) return route.continue();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_HEADERS });
    const call = jsonRpcCall(request);
    if (call !== undefined) return answerRpc(route, call.id, { method: call.method, params: call.params ?? [] });
    const atlas = options.atlas === undefined ? undefined : await atlasRequestOf(request, url);
    if (atlas !== undefined && options.atlas !== undefined) return answerAtlas(route, options.atlas(atlas));
    const http = request.method() === "GET" ? httpRequestOf(url) : undefined;
    if (http !== undefined) return answerHttp(route, http);
    traffic.aborted += 1;
    return route.abort("blockedbyclient");
  });
  return traffic;
}

/** The `data` of an `eth_call`, lowercase, or `undefined` for another method. */
export function callData(call: RpcCall): string | undefined {
  if (call.method !== "eth_call") return undefined;
  const transaction = call.params[0] as { data?: unknown; input?: unknown } | undefined;
  const data = transaction?.data ?? transaction?.input;
  return typeof data === "string" ? data.toLowerCase() : undefined;
}

/** The `to` of an `eth_call`, lowercase, or `undefined` for another method. */
export function callTarget(call: RpcCall): string | undefined {
  if (call.method !== "eth_call") return undefined;
  const to = (call.params[0] as { to?: unknown } | undefined)?.to;
  return typeof to === "string" ? to.toLowerCase() : undefined;
}
