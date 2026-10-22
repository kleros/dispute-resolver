import type { FetchResponse, Fetcher } from "@dispute-resolver/core";

type FetchFunction = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Only core's options are forwarded, and no request ever carries credentials: every URL core fetches (the
 * meta-evidence API, the IPFS gateway, court policies) is a third party.
 */
export function createFetcher(fetchFunction: FetchFunction): Fetcher {
  return (url, init) => fetchFunction(url, { credentials: "omit", signal: init?.signal ?? null, headers: { ...init?.headers } });
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason as Error);
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(signal.reason as Error);
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
