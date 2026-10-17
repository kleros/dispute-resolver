import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestBudget, isLookupLimitError } from "../rpc";
import { stubEndpoint } from "../test/rpc/testHelpers";
import type { ReadClient } from "../types";
import { lookupClientsOf } from "./lookupClients";

/**
 * viem keeps one batch queue per URL at module level, so each test reads through its own URL: a request left pending
 * under fake timers can then never hold up the next test.
 */
let urlCounter = 0;
let READ_URL = "";

/** A chain ID that is not in the chain table. */
const UNKNOWN_CHAIN = 999_999;

function arbitratorClient(budget: { readonly maxRequests: number; readonly deadlineMs: number }, options?: { readonly retryCount?: number }): ReadClient {
  const client = lookupClientsOf({ REACT_APP_WEB3_PROVIDER_URL: READ_URL })(createRequestBudget(budget), options)(1);
  if (client === undefined) throw new Error("chain 1 must have a client");
  return client;
}

beforeEach(() => {
  urlCounter += 1;
  READ_URL = `https://read.rpc.test/lookup-${String(urlCounter)}`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("lookupClientsOf", () => {
  it("A13: a Reality lookup reads through the chain's configured read RPC", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x64" }));
    expect(await arbitratorClient({ maxRequests: 10, deadlineMs: 60_000 }).getBlockNumber({ cacheTime: 0 })).toBe(100n);
    expect(endpoint.posts.map((post) => post.url)).toEqual([READ_URL]);
  });

  it("A5: every request of a Reality lookup spends its budget first, so the request count bounds what is sent", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x64" }));
    const arbitrator = arbitratorClient({ maxRequests: 2, deadlineMs: 60_000 });
    await arbitrator.getBlockNumber({ cacheTime: 0 });
    await arbitrator.getBlockNumber({ cacheTime: 0 });
    await expect(arbitrator.getBlockNumber({ cacheTime: 0 })).rejects.toSatisfy(isLookupLimitError);
    expect(endpoint.posts).toHaveLength(2);
  });

  it("ME-1 A5: a retry of the transport spends the lookup's budget, so a spent request count stops it", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const failure = expect(arbitratorClient({ maxRequests: 1, deadlineMs: 60_000 }).getBlockNumber({ cacheTime: 0 })).rejects.toSatisfy(isLookupLimitError);
    await vi.runAllTimersAsync();
    await failure;
    expect(endpoint.posts).toHaveLength(1);
  });

  it("ME-1 A5 §9.1: a retry of the transport after the lookup's deadline is never sent", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const start = Date.now();
    const failure = expect(arbitratorClient({ maxRequests: 10, deadlineMs: 1_000 }).getBlockNumber({ cacheTime: 0 })).rejects.toSatisfy(isLookupLimitError);
    await vi.runAllTimersAsync();
    await failure;
    expect(endpoint.posts.map((post) => post.at - start)).toEqual([0, 500]);
  });

  it("ME-1 §9.1: without an override a failed request is retried, every attempt counted against the budget", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const failure = expect(arbitratorClient({ maxRequests: 2, deadlineMs: 60_000 }).getBlockNumber({ cacheTime: 0 })).rejects.toSatisfy(isLookupLimitError);
    await vi.runAllTimersAsync();
    await failure;
    expect(endpoint.posts).toHaveLength(2);
  });

  it("ME-1 A5 §9.1: the lookup's retryCount override applies, so a request it does not retry is sent once", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const failure = expect(arbitratorClient({ maxRequests: 1, deadlineMs: 100 }, { retryCount: 0 }).getBlockNumber({ cacheTime: 0 })).rejects.toThrow(/HTTP request failed/);
    await vi.runAllTimersAsync();
    await failure;
    expect(endpoint.posts).toHaveLength(1);
  });

  it("A5: a spent deadline stops the next request before it is sent", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x64" }));
    await expect(arbitratorClient({ maxRequests: 10, deadlineMs: -1 }).getBlockNumber({ cacheTime: 0 })).rejects.toSatisfy(isLookupLimitError);
    expect(endpoint.posts).toHaveLength(0);
  });

  it("D-18: a chain that is not in the chain table has no client in the lookup", () => {
    expect(lookupClientsOf({ REACT_APP_WEB3_PROVIDER_URL: READ_URL })(createRequestBudget({ maxRequests: 1, deadlineMs: 1_000 }))(UNKNOWN_CHAIN)).toBeUndefined();
  });

  it("D-56: a chain without a read RPC has no client in the lookup", () => {
    expect(lookupClientsOf({})(createRequestBudget({ maxRequests: 1, deadlineMs: 1_000 }))(1)).toBeUndefined();
  });

  it("A5: one lookup sees one client per chain, so its per-client scan state is kept; another lookup gets its own", () => {
    const clients = lookupClientsOf({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    const lookup = clients(createRequestBudget({ maxRequests: 1, deadlineMs: 1_000 }));
    expect(lookup(1)).toBe(lookup(1));
    expect(clients(createRequestBudget({ maxRequests: 1, deadlineMs: 1_000 }))(1)).not.toBe(lookup(1));
  });
});
