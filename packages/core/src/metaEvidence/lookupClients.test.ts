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
  it("a Reality lookup reads through the chain's configured read RPC", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x64" }));
    expect(await arbitratorClient({ maxRequests: 10, deadlineMs: 60_000 }).getBlockNumber({ cacheTime: 0 })).toBe(100n);
    expect(endpoint.posts.map((post) => post.url)).toEqual([READ_URL]);
  });

  it("every request of a Reality lookup spends its budget first, so the request count bounds what is sent", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x64" }));
    const arbitrator = arbitratorClient({ maxRequests: 2, deadlineMs: 60_000 });
    await arbitrator.getBlockNumber({ cacheTime: 0 });
    await arbitrator.getBlockNumber({ cacheTime: 0 });
    await expect(arbitrator.getBlockNumber({ cacheTime: 0 })).rejects.toSatisfy(isLookupLimitError);
    expect(endpoint.posts).toHaveLength(2);
  });

  it("the lookup's retryCount override applies, so a request it does not retry is sent once", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const failure = expect(arbitratorClient({ maxRequests: 1, deadlineMs: 100 }, { retryCount: 0 }).getBlockNumber({ cacheTime: 0 })).rejects.toThrow(/HTTP request failed/);
    await vi.runAllTimersAsync();
    await failure;
    expect(endpoint.posts).toHaveLength(1);
  });

  it("a spent deadline stops the next request before it is sent", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x64" }));
    await expect(arbitratorClient({ maxRequests: 10, deadlineMs: -1 }).getBlockNumber({ cacheTime: 0 })).rejects.toSatisfy(isLookupLimitError);
    expect(endpoint.posts).toHaveLength(0);
  });

  it("a chain that is not in the chain table has no client in the lookup", () => {
    expect(lookupClientsOf({ REACT_APP_WEB3_PROVIDER_URL: READ_URL })(createRequestBudget({ maxRequests: 1, deadlineMs: 1_000 }))(UNKNOWN_CHAIN)).toBeUndefined();
  });

  it("a chain without a read RPC has no client in the lookup", () => {
    expect(lookupClientsOf({})(createRequestBudget({ maxRequests: 1, deadlineMs: 1_000 }))(1)).toBeUndefined();
  });

  it("one lookup sees one client per chain, so its per-client scan state is kept; another lookup gets its own", () => {
    const clients = lookupClientsOf({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    const lookup = clients(createRequestBudget({ maxRequests: 1, deadlineMs: 1_000 }));
    expect(lookup(1)).toBe(lookup(1));
    expect(clients(createRequestBudget({ maxRequests: 1, deadlineMs: 1_000 }))(1)).not.toBe(lookup(1));
  });
});
