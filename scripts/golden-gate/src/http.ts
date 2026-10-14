import { setTimeout as sleep } from "node:timers/promises";

/** The part of `fetch` the gate uses, injected so tests answer from stubs. */
export type HttpGet = (url: string, init: { readonly signal: AbortSignal }) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

/** Per-request limit for the meta-evidence API and the IPFS gateway. */
const REQUEST_TIMEOUT_MS = 60_000;

/** Attempts of a request that failed in transport or with a server error (5xx); any other answer is final. */
const ATTEMPTS = 4;

/** Back-off before the second attempt, multiplied by `BACKOFF_FACTOR` before each later one (1 s, 4 s, 16 s). */
const FIRST_BACKOFF_MS = 1_000;
const BACKOFF_FACTOR = 4;

/** An answer below 500 with its body, or the last failure once the attempts are spent. Never carries the URL. */
export type HttpResult =
  | { readonly kind: "answer"; readonly ok: boolean; readonly status: number; readonly text: string }
  | { readonly kind: "failed"; readonly detail: string };

/** Why a request failed, without its URL: a timeout, or the network error code Node reports (`ECONNRESET`, …). */
function describeFailure(error: unknown): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "the request timed out";
  const cause: unknown = error instanceof Error ? error.cause : undefined;
  const code = typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" ? ` (${cause.code})` : "";
  return `the request failed${code}`;
}

/** Retry timing of `httpGet`; tests pass a zero back-off. */
export interface RetryPolicy {
  readonly firstBackoffMs: number;
}

const DEFAULT_RETRY: RetryPolicy = { firstBackoffMs: FIRST_BACKOFF_MS };

/**
 * GETs `url` and reads its body, retrying a transport failure or a 5xx answer up to `ATTEMPTS` times with a growing
 * back-off. The result never carries the URL (the meta-evidence API URL comes from `.env`).
 */
export async function httpGet(get: HttpGet, url: string, retry: RetryPolicy = DEFAULT_RETRY): Promise<HttpResult> {
  let last: HttpResult = { kind: "failed", detail: "no attempt was made" };
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(retry.firstBackoffMs * BACKOFF_FACTOR ** (attempt - 1));
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
