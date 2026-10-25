import { BodyTooLargeError, type FetchResponse, type Fetcher } from "@dispute-resolver/core";
import { FETCH_BODY_MAX_BYTES } from "./constants";

type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;

/** The declared body length, 0 when the answer declares none. */
function declaredLength(response: Response): number {
  const length = Number(response.headers.get("content-length"));
  return Number.isFinite(length) && length > 0 ? length : 0;
}

/** Reads the body while it stays within `maxBytes`; past them the read stops and rejects. */
async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Reads the body once, on the first `text()` or `json()`, decoded as UTF-8 like `Response.text()`. */
function boundedResponse(response: Response, maxBytes: number): FetchResponse {
  let bytes: Promise<Uint8Array> | undefined;
  const text = (): Promise<string> => {
    bytes ??= readBounded(response, maxBytes);
    return bytes.then((read) => new TextDecoder().decode(read));
  };
  return { ok: response.ok, status: response.status, text, json: () => text().then((body): unknown => JSON.parse(body)) };
}

/**
 * Only core's options are forwarded, and no request ever carries credentials: every URL core fetches (the
 * meta-evidence API, the IPFS gateway, court policies) is a third party. No body is read past `maxBodyBytes`: an answer
 * that declares more rejects before its body is read (the declared length may be the compressed size, so the streamed
 * bytes are counted as well), and a body that streams past the cap rejects with `BodyTooLargeError`.
 */
export function createFetcher(fetchFunction: FetchFunction, maxBodyBytes: number = FETCH_BODY_MAX_BYTES): Fetcher {
  return async (url, init) => {
    const response = await fetchFunction(url, { credentials: "omit", signal: init?.signal ?? null, headers: { ...init?.headers } });
    if (declaredLength(response) > maxBodyBytes) {
      response.body?.cancel().catch(() => undefined);
      throw new BodyTooLargeError(maxBodyBytes);
    }
    return boundedResponse(response, maxBodyBytes);
  };
}

/** Rejects with `reason()` as soon as `signal` aborts, but leaves the work behind `promise` running. */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal, reason: () => Error = () => signal.reason as Error): Promise<T> {
  if (signal.aborted) return Promise.reject(reason());
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(reason());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

/**
 * Bounds each exchange, the body read included: past the bound the request and any pending body read reject with a
 * `TimeoutError`, and the signal forwarded to `fetcher` aborts. The clock stops once the body is read or the request fails.
 */
export function withTimeout(fetcher: Fetcher, timeoutMs: number): Fetcher {
  return async (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException(`No answer from ${url} within ${String(timeoutMs)} ms.`, "TimeoutError"));
    }, timeoutMs);
    const stop = (): void => {
      clearTimeout(timer);
    };
    const callerSignal = init?.signal;
    if (callerSignal?.aborted === true) controller.abort(callerSignal.reason);
    callerSignal?.addEventListener(
      "abort",
      () => {
        controller.abort(callerSignal.reason);
      },
      { once: true },
    );
    const bounded = <T>(promise: Promise<T>): Promise<T> => untilAborted(promise, controller.signal).finally(stop);
    let response: FetchResponse;
    try {
      response = await untilAborted(fetcher(url, { ...init, signal: controller.signal }), controller.signal);
    } catch (error) {
      stop();
      throw error;
    }
    return { ok: response.ok, status: response.status, json: () => bounded(response.json()), text: () => bounded(response.text()) };
  };
}
