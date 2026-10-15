import { setTimeout as sleep } from "node:timers/promises";

/** The part of `fetch` the gate uses, injected so tests answer from stubs. */
export type HttpGet = (url: string, init: { readonly signal: AbortSignal }) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

/** Per-request limit for the meta-evidence API and the IPFS gateway. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Attempts of a read that failed transiently: a request that failed in transport or with a server error (5xx), or a
 * dispute lookup that was unavailable. Any other answer is final.
 */
export const ATTEMPTS = 4;

/** Back-off before the second attempt, multiplied by `BACKOFF_FACTOR` before each later one (1 s, 4 s, 16 s). */
const FIRST_BACKOFF_MS = 1_000;
const BACKOFF_FACTOR = 4;

/** An answer below 500 with its body, or the last failure once the attempts are spent. Never carries the URL. */
export type HttpResult =
  | { readonly kind: "answer"; readonly ok: boolean; readonly status: number; readonly text: string }
  | { readonly kind: "failed"; readonly detail: string };

/** How deep a chain of `cause`s is followed; viem and undici wrap a failure a few times at most. */
const MAX_CAUSE_DEPTH = 8;

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null && name in value ? (value as Readonly<Record<string, unknown>>)[name] : undefined;
}

/** A name or a code worth printing: a non-empty string or a finite number. */
function label(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

/** `error` and its causes, outermost first. */
function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  for (let link = error; link !== undefined && link !== null && chain.length < MAX_CAUSE_DEPTH; link = field(link, "cause")) chain.push(link);
  return chain;
}

/**
 * Why a request failed, without its URL: the HTTP status an error in its cause chain carries (viem's
 * `HttpRequestError`), a timeout, or the class and code of its innermost named cause (`ConnectTimeoutError
 * UND_ERR_CONNECT_TIMEOUT`, `Error ECONNRESET`, `RpcRequestError -32005`, …). Never a message, a URL or details, which
 * can name the host or carry the RPC key.
 */
export function describeFailure(error: unknown): string {
  const chain = causeChain(error);
  const status = chain.map((link) => field(link, "status")).find((value) => typeof value === "number" && Number.isInteger(value));
  if (typeof status === "number") return `HTTP ${String(status)}`;
  if (chain.some((link) => field(link, "name") === "TimeoutError" || field(link, "name") === "AbortError")) return "the request timed out";
  const cause = chain
    .slice(1)
    .filter((link) => label(field(link, "name")) !== null)
    .at(-1);
  const parts = [label(field(cause, "name")), label(field(cause, "code"))].filter((part) => part !== null);
  return parts.length === 0 ? "the request failed" : `the request failed (${parts.join(" ")})`;
}

/** Retry timing of `httpGet`; tests pass a zero back-off. */
export interface RetryPolicy {
  readonly firstBackoffMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { firstBackoffMs: FIRST_BACKOFF_MS };

/** Waits the back-off before attempt `attempt` (counted from 0): nothing before the first, then 1 s, 4 s, 16 s by default. */
export async function backOff(retry: RetryPolicy, attempt: number): Promise<void> {
  if (attempt > 0) await sleep(retry.firstBackoffMs * BACKOFF_FACTOR ** (attempt - 1));
}

/**
 * GETs `url` and reads its body, retrying a transport failure or a 5xx answer up to `ATTEMPTS` times with a growing
 * back-off. The result never carries the URL (the meta-evidence API URL comes from `.env`).
 */
export async function httpGet(get: HttpGet, url: string, retry: RetryPolicy = DEFAULT_RETRY): Promise<HttpResult> {
  let last: HttpResult = { kind: "failed", detail: "no attempt was made" };
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    await backOff(retry, attempt);
    try {
      const response = await get(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const text = await response.text();
      if (response.status < 500) return { kind: "answer", ok: response.ok, status: response.status, text };
      last = { kind: "failed", detail: `HTTP ${String(response.status)}` };
    } catch (error) {
      last = { kind: "failed", detail: describeFailure(error) };
    }
  }
  return last;
}

export const nodeHttpGet: HttpGet = (url, init) => fetch(url, { signal: init.signal });
