import type { FetchResponse, Fetcher } from "@dispute-resolver/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFetcher, withTimeout } from "./fetcher";

const BOUND_MS = 1_000;
const URL = "https://cdn.kleros.link/ipfs/QmPolicy/policy.json";
const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

function answer(body: () => Promise<unknown>): FetchResponse {
  return { ok: true, status: 200, json: body, text: () => body().then(String) };
}

/** Whether the promise has settled after the fake clock moved by `ms`, and how. */
async function stateAfter(promise: Promise<unknown>, ms: number): Promise<string> {
  const outcome = promise.then(
    () => "answered",
    (error: unknown) => (error instanceof DOMException ? error.name : "rejected"),
  );
  await vi.advanceTimersByTimeAsync(ms);
  return Promise.race([outcome, Promise.resolve("pending")]);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("core fetcher (ARCHITECTURE.md §5.1)", () => {
  it("§5.1: never sends credentials and forwards only core's signal and headers", async () => {
    const response = new Response("{}", { status: 200 });
    const fetchFunction = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => Promise.resolve(response));
    const controller = new AbortController();
    const fetcher = createFetcher(fetchFunction);

    await expect(fetcher("https://cdn.kleros.link/ipfs/Qm", { signal: controller.signal, headers: { accept: "application/json" } })).resolves.toBe(response);

    expect(fetchFunction).toHaveBeenCalledWith("https://cdn.kleros.link/ipfs/Qm", { credentials: "omit", signal: controller.signal, headers: { accept: "application/json" } });
  });

  it("§5.1: a call without options still omits credentials", async () => {
    const fetchFunction = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(null, { status: 404 })));
    await createFetcher(fetchFunction)("https://example.com/");
    expect(fetchFunction.mock.calls[0]?.[1]).toEqual({ credentials: "omit", signal: null, headers: {} });
  });
});

describe("bounded fetcher (DATA-4, D-37, D-19)", () => {
  it("DATA-4 / D-37: a request that never answers rejects once the bound passes", async () => {
    vi.useFakeTimers();
    const request = withTimeout(never, BOUND_MS)(URL);
    expect(await stateAfter(request, BOUND_MS - 1)).toBe("pending");
    expect(await stateAfter(request, 1)).toBe("TimeoutError");
  });

  it("DATA-4 / D-37: a body that never arrives rejects once the bound passes", async () => {
    vi.useFakeTimers();
    const response = await withTimeout(() => Promise.resolve(answer(never)), BOUND_MS)(URL);
    expect(await stateAfter(response.json(), BOUND_MS)).toBe("TimeoutError");
  });

  it("DATA-4 / D-19: an answer within the bound passes through", async () => {
    vi.useFakeTimers();
    const response = await withTimeout(() => Promise.resolve(answer(() => Promise.resolve({ name: "General Court" }))), BOUND_MS)(URL);
    await expect(response.json()).resolves.toEqual({ name: "General Court" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("DATA-4: the caller's signal still aborts the request, and the bound aborts the signal it forwards", async () => {
    vi.useFakeTimers();
    const forwarded: AbortSignal[] = [];
    const recording: Fetcher = (_url, init) => {
      if (init?.signal !== undefined) forwarded.push(init.signal);
      return never();
    };
    const caller = new AbortController();
    const aborted = withTimeout(recording, BOUND_MS)(URL, { signal: caller.signal });
    caller.abort(new DOMException("The query was cancelled.", "AbortError"));
    expect(await stateAfter(aborted, 0)).toBe("AbortError");
    expect(forwarded[0]?.aborted).toBe(true);

    void withTimeout(recording, BOUND_MS)(URL).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(BOUND_MS);
    expect(forwarded[1]?.aborted).toBe(true);
  });
});
