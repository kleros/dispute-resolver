/**
 * The RPC pre-flight (checklist C10 and section D): for every chain of `CHAINS` it resolves the read RPC and the public
 * RPC from the environment with core's own resolvers and checks each endpoint:
 *
 *   - `eth_getLogs` over a range of at least 10,000 blocks ending at the head it just read either succeeds or is
 *     refused as a range cap. A capped endpoint is then asked for the smallest window of the chunked scans of `rpc`
 *     (100 blocks) and is reported as "capped" only when it answers that window; an HTTP 429 is rate limiting, never a
 *     cap. Any other answer fails;
 *   - the endpoint accepts a request from an opaque origin, which is what the script runner's sandbox sends
 *     (`Origin: null`): the CORS preflight and the request itself are answered with an `Access-Control-Allow-Origin` of
 *     `null` or `*`, and the preflight allows the `content-type` header.
 *
 * No request follows a redirect: a browser refuses a redirected CORS preflight, so a redirect fails the endpoint.
 *
 * Usage (run through tsx by the package script `rpc:preflight`): the repository's `.env` is read when present, the
 * environment winning. Output is one line per endpoint with the chain ID, the head and range checked and the results.
 * Endpoint URLs carry API keys, so they and anything derived from them never reach the output.
 *
 * Exit code 0 when no endpoint failed (capped endpoints are reported, not failures); 1 when any endpoint failed, a chain
 * has no read RPC, or the arguments are wrong. Operator tooling: the only core code besides the generator that reads `process.env`.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAINS, resolvePublicRpcUrl, resolveReadRpcUrl } from "../src/chains";
import type { ChainTable } from "../src/chains";
import { LOOKUP_LIMITS } from "../src/reality/constants";
import { isRangeLimitError } from "../src/rpc";
import type { Env } from "../src/types";

const ENV_FILE = resolve(import.meta.dirname, "../../../.env");

/** The smallest range the pre-flight asks `eth_getLogs` for: the scan window of the chunked reads (spec 9.1). */
const LOG_RANGE_BLOCKS = 10_000;
/** The smallest window the chunked scans shrink to after a range refusal (spec 9.1); a capped endpoint must answer it. */
export const MIN_WINDOW_BLOCKS = LOOKUP_LIMITS.minWindowSize;
const HTTP_TOO_MANY_REQUESTS = 429;
const DEFAULT_TIMEOUT_MS = 15_000;
/** An address that never emitted a log, so the answer is empty and only the range can be refused. */
const SILENT_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_DETAIL_LENGTH = 160;

/** `fetch`, or a double of it in tests. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type LogsResult =
  | { readonly status: "ok"; readonly fromBlock: number; readonly toBlock: number; readonly count: number }
  | { readonly status: "capped"; readonly fromBlock: number; readonly toBlock: number; readonly detail: string }
  | { readonly status: "failed"; readonly reason: string; readonly fromBlock?: number; readonly toBlock?: number };

export type CorsResult = { readonly status: "ok" } | { readonly status: "failed"; readonly reason: string };

export interface EndpointReport {
  readonly head?: number;
  readonly logs: LogsResult;
  readonly cors: CorsResult;
}

export type Role = "read" | "public";

export interface EndpointEntry {
  readonly roles: readonly Role[];
  readonly outcome: EndpointReport | "unconfigured";
}

export interface ChainReport {
  readonly chainId: number;
  readonly endpoints: readonly EndpointEntry[];
}

interface CheckSettings {
  readonly timeoutMs?: number;
}

interface JsonRpcReply {
  readonly result?: unknown;
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
}

/** The outcome of one JSON-RPC call: its reply, or the reason it produced none. */
type CallOutcome =
  | { readonly kind: "reply"; readonly reply: JsonRpcReply; readonly response: Response }
  | { readonly kind: "http"; readonly status: number }
  | { readonly kind: "redirected" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "network"; readonly reason: string };

/**
 * Removes every URL and everything that identifies one from a text: the configured URLs' hosts, path segments and query
 * values, any other URL, and any long token (a key a provider echoes without its URL).
 */
export function redact(text: string, urls: readonly string[]): string {
  let redacted = text.replaceAll(/https?:\/\/\S+/g, "<url>");
  for (const configured of urls) {
    const pieces = new Set<string>();
    try {
      const parsed = new URL(configured);
      pieces.add(parsed.host);
      for (const segment of parsed.pathname.split("/")) pieces.add(segment);
      for (const value of parsed.searchParams.values()) pieces.add(value);
    } catch {
      pieces.add(configured);
    }
    for (const piece of pieces) {
      if (piece.length >= 6) redacted = redacted.replaceAll(piece, "<redacted>");
    }
  }
  return redacted.replaceAll(/[A-Za-z0-9_-]{16,}/g, "<redacted>");
}

function truncate(text: string): string {
  return text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH)}...` : text;
}

/** A failed request named by its kind and code, never by its message, which can repeat the URL. */
function describeNetworkError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return `timed out after ${String(timeoutMs)} ms`;
  const cause = error instanceof Error ? error.cause : undefined;
  const code = typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
  return code !== undefined && /^[A-Z0-9_]{3,40}$/.test(code) ? `connection failed (${code})` : "connection failed";
}

function isReply(value: unknown): value is JsonRpcReply {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function send(url: string, fetchFn: FetchLike, init: RequestInit, timeoutMs: number): Promise<{ response: Response } | { network: string }> {
  try {
    return { response: await fetchFn(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) }) };
  } catch (error) {
    return { network: describeNetworkError(error, timeoutMs) };
  }
}

/** Whether an answer is a redirect, as `redirect: "manual"` reports it in a browser (opaque) or in Node (the 3xx itself). */
function isRedirect(response: Response): boolean {
  return response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400);
}

async function call(
  url: string,
  fetchFn: FetchLike,
  method: string,
  params: readonly unknown[],
  headers: Readonly<Record<string, string>>,
  timeoutMs: number,
): Promise<CallOutcome> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const sent = await send(url, fetchFn, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body }, timeoutMs);
  if ("network" in sent) return { kind: "network", reason: sent.network };
  const { response } = sent;
  if (isRedirect(response)) return { kind: "redirected" };
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return response.ok ? { kind: "unreadable" } : { kind: "http", status: response.status };
  }
  if (isReply(parsed) && (parsed.error !== undefined || response.ok)) return { kind: "reply", reply: parsed, response };
  return response.ok ? { kind: "unreadable" } : { kind: "http", status: response.status };
}

function hex(value: number): string {
  return `0x${value.toString(16)}`;
}

/** The text of a JSON-RPC error, safe to print. */
function describeRpcError(error: NonNullable<JsonRpcReply["error"]>, url: string): string {
  const code = typeof error.code === "number" ? String(error.code) : "unknown code";
  const message = typeof error.message === "string" ? truncate(redact(error.message, [url])) : "no message";
  return `JSON-RPC error ${code}: ${message}`;
}

async function readHead(url: string, fetchFn: FetchLike, timeoutMs: number): Promise<{ head: number } | { reason: string }> {
  const outcome = await call(url, fetchFn, "eth_blockNumber", [], {}, timeoutMs);
  if (outcome.kind === "network") return { reason: `block number unavailable: ${outcome.reason}` };
  if (outcome.kind === "http") return { reason: `block number unavailable: HTTP ${String(outcome.status)}` };
  if (outcome.kind === "redirected") return { reason: "block number unavailable: redirected" };
  if (outcome.kind === "unreadable") return { reason: "block number unavailable: the answer is not JSON-RPC" };
  const { result, error } = outcome.reply;
  if (error !== undefined) return { reason: `block number unavailable: ${describeRpcError(error, url)}` };
  const head = typeof result === "string" && /^0x[0-9a-f]+$/i.test(result) ? Number(BigInt(result)) : Number.NaN;
  return Number.isSafeInteger(head) ? { head } : { reason: "block number unavailable: the result is not a block number" };
}

/** What one `eth_getLogs` answer says about the range it asked for. */
type LogsAnswer = { readonly kind: "ok"; readonly count: number } | { readonly kind: "capped"; readonly detail: string } | { readonly kind: "failed"; readonly reason: string };

function describeHttpStatus(status: number): string {
  return status === HTTP_TOO_MANY_REQUESTS ? "HTTP 429 (rate limited)" : `HTTP ${String(status)}`;
}

/** Classifies an `eth_getLogs` answer. HTTP 429 is rate limiting whatever its body says, so it is never a range cap. */
function classifyLogs(outcome: CallOutcome, url: string): LogsAnswer {
  if (outcome.kind === "network") return { kind: "failed", reason: outcome.reason };
  if (outcome.kind === "unreadable") return { kind: "failed", reason: "the answer is not JSON-RPC" };
  if (outcome.kind === "redirected") return { kind: "failed", reason: "redirected" };
  if (outcome.kind === "http") {
    if (isRangeLimitError({ code: outcome.status, message: `HTTP ${String(outcome.status)}` })) return { kind: "capped", detail: `HTTP ${String(outcome.status)}` };
    return { kind: "failed", reason: describeHttpStatus(outcome.status) };
  }
  const { result, error } = outcome.reply;
  if (error !== undefined) {
    const detail = describeRpcError(error, url);
    if (outcome.response.status === HTTP_TOO_MANY_REQUESTS) return { kind: "failed", reason: `${describeHttpStatus(HTTP_TOO_MANY_REQUESTS)}: ${detail}` };
    const capped = isRangeLimitError({ code: error.code, message: typeof error.message === "string" ? error.message : "" });
    return capped ? { kind: "capped", detail } : { kind: "failed", reason: detail };
  }
  return Array.isArray(result) ? { kind: "ok", count: result.length } : { kind: "failed", reason: "the result is not a list of logs" };
}

async function requestLogs(url: string, fetchFn: FetchLike, range: { fromBlock: number; toBlock: number }, timeoutMs: number): Promise<LogsAnswer> {
  const filter = { fromBlock: hex(range.fromBlock), toBlock: hex(range.toBlock), address: SILENT_ADDRESS };
  return classifyLogs(await call(url, fetchFn, "eth_getLogs", [filter], {}, timeoutMs), url);
}

/**
 * Asks for the 10,000-block range; when it is capped, asks for the smallest window of the chunked scans too, because an
 * endpoint that refuses that window fails every scan the app makes.
 */
async function checkLogs(url: string, fetchFn: FetchLike, head: number, timeoutMs: number): Promise<LogsResult> {
  const range = { fromBlock: Math.max(0, head - LOG_RANGE_BLOCKS), toBlock: head };
  const answer = await requestLogs(url, fetchFn, range, timeoutMs);
  if (answer.kind === "ok") return { status: "ok", count: answer.count, ...range };
  if (answer.kind === "failed") return { status: "failed", reason: answer.reason, ...range };
  const window = { fromBlock: Math.max(0, head - MIN_WINDOW_BLOCKS + 1), toBlock: head };
  const floor = await requestLogs(url, fetchFn, window, timeoutMs);
  if (floor.kind === "ok") return { status: "capped", detail: answer.detail, ...range };
  const refusal = floor.kind === "capped" ? floor.detail : floor.reason;
  return { status: "failed", reason: `range capped (${answer.detail}); the ${String(MIN_WINDOW_BLOCKS)}-block window of the chunked scans failed too (${refusal})`, ...window };
}

/** Whether an `Access-Control-Allow-Origin` value lets an opaque origin read the answer. */
function allowsNullOrigin(value: string | null): "missing" | "other" | "allowed" {
  if (value === null) return "missing";
  const trimmed = value.trim();
  return trimmed === "*" || trimmed === "null" ? "allowed" : "other";
}

function allowsContentType(value: string | null): boolean {
  if (value === null) return false;
  const names = value.split(",").map((name) => name.trim().toLowerCase());
  return names.includes("content-type") || names.includes("*");
}

async function checkCors(url: string, fetchFn: FetchLike, timeoutMs: number): Promise<CorsResult> {
  const preflight = await send(
    url,
    fetchFn,
    { method: "OPTIONS", headers: { Origin: "null", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } },
    timeoutMs,
  );
  if ("network" in preflight) return { status: "failed", reason: `preflight: ${preflight.network}` };
  const { response } = preflight;
  if (isRedirect(response)) return { status: "failed", reason: "preflight: redirected" };
  if (!response.ok) return { status: "failed", reason: `preflight: HTTP ${String(response.status)}` };
  const preflightOrigin = allowsNullOrigin(response.headers.get("access-control-allow-origin"));
  if (preflightOrigin === "missing") return { status: "failed", reason: "preflight: no Access-Control-Allow-Origin" };
  if (preflightOrigin === "other") return { status: "failed", reason: "preflight: Access-Control-Allow-Origin allows neither null nor any origin" };
  if (!allowsContentType(response.headers.get("access-control-allow-headers")))
    return { status: "failed", reason: "preflight: Access-Control-Allow-Headers does not allow content-type" };

  const request = await call(url, fetchFn, "eth_blockNumber", [], { Origin: "null" }, timeoutMs);
  if (request.kind === "network") return { status: "failed", reason: `request: ${request.reason}` };
  if (request.kind === "http") return { status: "failed", reason: `request: HTTP ${String(request.status)}` };
  if (request.kind === "redirected") return { status: "failed", reason: "request: redirected" };
  if (request.kind === "unreadable" || request.reply.error !== undefined) return { status: "failed", reason: "request: the endpoint did not answer a request with Origin: null" };
  const requestOrigin = allowsNullOrigin(request.response.headers.get("access-control-allow-origin"));
  if (requestOrigin === "missing") return { status: "failed", reason: "request: no Access-Control-Allow-Origin" };
  if (requestOrigin === "other") return { status: "failed", reason: "request: Access-Control-Allow-Origin allows neither null nor any origin" };
  return { status: "ok" };
}

/** Checks one endpoint: the log range, then the opaque-origin request. Never throws. */
export async function checkEndpoint(url: string, fetchFn: FetchLike, settings: CheckSettings = {}): Promise<EndpointReport> {
  const timeoutMs = settings.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const head = await readHead(url, fetchFn, timeoutMs);
  const logs: LogsResult = "head" in head ? await checkLogs(url, fetchFn, head.head, timeoutMs) : { status: "failed", reason: head.reason };
  const cors = await checkCors(url, fetchFn, timeoutMs);
  return "head" in head ? { head: head.head, logs, cors } : { logs, cors };
}

interface PreflightOptions extends CheckSettings {
  readonly env: Env;
  readonly fetchFn: FetchLike;
  readonly chains?: ChainTable;
}

async function checkChain(chainId: number, chains: ChainTable, options: PreflightOptions): Promise<ChainReport> {
  const chain = chains[chainId];
  if (chain === undefined) return { chainId, endpoints: [] };
  const read = resolveReadRpcUrl(chain, options.env);
  const published = resolvePublicRpcUrl(chain, options.env);
  const targets: { roles: Role[]; url: string | undefined }[] = [];
  if (read.status === "unconfigured") targets.push({ roles: ["read"], url: undefined });
  else if (published.status === "configured" && published.url !== read.url) targets.push({ roles: ["read"], url: read.url });
  else targets.push({ roles: ["read", "public"], url: read.url });
  if (published.status === "configured" && (read.status === "unconfigured" || published.url !== read.url)) targets.push({ roles: ["public"], url: published.url });
  const endpoints: EndpointEntry[] = [];
  for (const { roles, url } of targets) {
    endpoints.push({ roles, outcome: url === undefined ? "unconfigured" : await checkEndpoint(url, options.fetchFn, options) });
  }
  return { chainId, endpoints };
}

/** Runs the pre-flight over every chain of the table; the chains run side by side, the endpoints of a chain in turn. */
export function runPreflight(options: PreflightOptions): Promise<ChainReport[]> {
  const chains = options.chains ?? CHAINS;
  return Promise.all(Object.values(chains).map((chain) => checkChain(chain.id, chains, options)));
}

function entryFailed(entry: EndpointEntry): boolean {
  return entry.outcome === "unconfigured" || entry.outcome.logs.status === "failed" || entry.outcome.cors.status === "failed";
}

export function isFailure(report: ChainReport): boolean {
  return report.endpoints.some(entryFailed);
}

export function summarize(reports: readonly ChainReport[]): { failed: number; capped: number; endpoints: number } {
  const entries = reports.flatMap((report) => report.endpoints);
  return {
    failed: entries.filter(entryFailed).length,
    capped: entries.filter((entry) => entry.outcome !== "unconfigured" && entry.outcome.logs.status === "capped").length,
    endpoints: entries.length,
  };
}

function describeLogs(logs: LogsResult): string {
  const range = logs.status === "failed" && logs.fromBlock === undefined ? "" : ` ${String(logs.fromBlock)}-${String(logs.toBlock)}`;
  if (logs.status === "ok") return `eth_getLogs${range} ok, ${String(logs.count)} logs`;
  if (logs.status === "capped") return `eth_getLogs${range} capped (${logs.detail}), ${String(MIN_WINDOW_BLOCKS)}-block window ok`;
  return `eth_getLogs${range} FAILED (${logs.reason})`;
}

/** The lines that report a chain: one per endpoint, with the chain ID and results only. */
export function formatChainReport(report: ChainReport): string[] {
  return report.endpoints.map((entry) => {
    const label = `chain ${String(report.chainId)} ${entry.roles.join("+")}:`;
    if (entry.outcome === "unconfigured") return `${label} FAILED, no ${entry.roles.join("+")} RPC is configured`;
    const { head, logs, cors } = entry.outcome;
    const origin = cors.status === "ok" ? "ok" : `FAILED (${cors.reason})`;
    const headPart = head === undefined ? "" : `head ${String(head)}; `;
    return `${label} ${headPart}${describeLogs(logs)}; Origin null ${origin}`;
  });
}

async function main(): Promise<number> {
  if (process.argv.length > 2) {
    console.error("Usage: preflight-rpc (no arguments; the RPC settings come from the environment and the repository's .env)");
    return 1;
  }
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const reports = await runPreflight({ env: process.env, fetchFn: fetch });
  for (const line of reports.flatMap(formatChainReport)) console.info(line);
  const { failed, capped, endpoints } = summarize(reports);
  if (failed > 0) {
    console.error(`RPC pre-flight failed: ${String(failed)} of ${String(endpoints)} endpoints (${String(capped)} capped).`);
    return 1;
  }
  console.info(`RPC pre-flight passed: ${String(endpoints)} endpoints on ${String(reports.length)} chains (${String(capped)} capped).`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
