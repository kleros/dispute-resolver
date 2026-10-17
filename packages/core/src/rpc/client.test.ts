import { parseAbiItem } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChain } from "../chains";
import type { ChainConfig } from "../chains/types";
import type { ReadClient } from "../types";
import { createReadClient, createReadClients, createRequestBudget, isLookupLimitError } from "./index";
import { rpcCalls, stubEndpoint } from "../test/rpc/testHelpers";
import type { BudgetedReadClientOptions } from "./types";

/**
 * viem keeps one batch queue per URL at module level, so each test reads through its own URL: a request left pending
 * under fake timers can then never hold up the next test.
 */
let urlCounter = 0;
let READ_URL = "";
const PUBLIC_URL = "https://public.rpc.example/mainnet";
const event = parseAbiItem("event Ruling(address indexed _arbitrator, uint256 indexed _disputeID, uint256 _ruling)");
const address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";

function chainOf(id: number): ChainConfig {
  const chain = getChain(id);
  if (chain === undefined) throw new Error(`chain ${String(id)} is not in the table`);
  return chain;
}

function readClient(env: Record<string, string>, options?: BudgetedReadClientOptions): ReadClient {
  const resolution = createReadClient(chainOf(1), env, options);
  if (resolution.status !== "ok") throw new Error("expected a configured client");
  return resolution.client;
}

const getLogs = (client: ReadClient) => client.getLogs({ address, event, fromBlock: 1n, toBlock: 2n });

beforeEach(() => {
  urlCounter += 1;
  READ_URL = `https://read.rpc.example/${String(urlCounter)}`;
});

describe("createReadClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("A13: reads through the chain's configured read RPC", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x10" }));
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    expect(await client.getBlockNumber()).toBe(16n);
    expect(endpoint.posts.map((post) => post.url)).toEqual([READ_URL]);
  });

  it("A13: never reads through the public RPC given to third-party frames", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x10" }));
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL, REACT_APP_PUBLIC_RPC_1: PUBLIC_URL });
    await client.getBlockNumber();
    expect(endpoint.posts.map((post) => post.url)).toEqual([READ_URL]);
  });

  it("A13: uses the literal read RPC of zkSync when its variable is unset", async () => {
    const zkSync = chainOf(324);
    const resolution = createReadClient(zkSync, {});
    expect(resolution.status).toBe("ok");
    const endpoint = stubEndpoint(() => ({ result: "0x1" }));
    if (resolution.status === "ok") await resolution.client.getBlockNumber();
    expect(endpoint.posts.map((post) => new URL(post.url).origin)).toEqual([zkSync.defaultRpcUrl]);
  });

  it("D-56: a chain whose read variable is unset is unconfigured, with no wallet or public fallback", () => {
    expect(createReadClient(chainOf(1), {})).toEqual({ status: "unconfigured", chainId: 1 });
    expect(createReadClient(chainOf(1), { REACT_APP_PUBLIC_RPC_1: PUBLIC_URL })).toEqual({ status: "unconfigured", chainId: 1 });
    expect(createReadClient(chainOf(100), { REACT_APP_WEB3_XDAI_PROVIDER_URL: "  " })).toEqual({ status: "unconfigured", chainId: 100 });
  });

  it("§9.1: retries a failed request twice, after 500 ms and 2 s", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    const start = Date.now();
    const failure = expect(client.getBlockNumber()).rejects.toThrow(/HTTP request failed/);
    await vi.runAllTimersAsync();
    await failure;
    expect(endpoint.posts.map((post) => post.at - start)).toEqual([0, 500, 2_500]);
  });

  it("§9.1: a request that succeeds on retry resolves", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    stubEndpoint(() => {
      attempts += 1;
      return attempts === 1 ? { error: { code: -32000, message: "header not found" } } : { result: "0x2a" };
    });
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    const blockNumber = client.getBlockNumber();
    await vi.runAllTimersAsync();
    expect(await blockNumber).toBe(42n);
    expect(attempts).toBe(2);
  });

  it("§9.1: an eth_getLogs range refusal is returned at once, never retried", async () => {
    const endpoint = stubEndpoint(() => ({ error: { code: -32005, message: "query returned more than 10000 results" } }));
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    await expect(getLogs(client)).rejects.toThrow(/more than 10000 results/);
    expect(rpcCalls(endpoint)).toHaveLength(1);
  });

  it("§9.1: an eth_getLogs failure that is not a range limit is retried", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ error: { code: -32000, message: "header not found" } }));
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    const failure = expect(getLogs(client)).rejects.toThrow(/header not found/);
    await vi.runAllTimersAsync();
    await failure;
    expect(rpcCalls(endpoint)).toHaveLength(3);
  });

  it("§9.1: a rate-limited eth_getLogs is retried, not treated as a range limit", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ error: { code: -32005, message: "daily request count exceeded, request rate limited" } }));
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    const failure = expect(getLogs(client)).rejects.toThrow(/rate limited/);
    await vi.runAllTimersAsync();
    await failure;
    expect(rpcCalls(endpoint)).toHaveLength(3);
  });

  it("§9.1: retryCount 0 makes a single attempt", async () => {
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL }, { retryCount: 0 });
    await expect(client.getBlockNumber()).rejects.toThrow(/HTTP request failed/);
    expect(endpoint.posts).toHaveLength(1);
  });

  it("§9.1: each request times out after 20 s by default", async () => {
    vi.useFakeTimers();
    stubEndpoint(() => "hang");
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL }, { retryCount: 0 });
    let settled = false;
    const failure = client.getBlockNumber().finally(() => {
      settled = true;
    });
    const assertion = expect(failure).rejects.toThrow(/took too long/);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it("§9.1: an eth_getLogs timeout counts as a range limit and is not retried", async () => {
    const endpoint = stubEndpoint(() => "hang");
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL }, { timeoutMs: 20 });
    await expect(getLogs(client)).rejects.toThrow(/took too long/);
    expect(endpoint.posts).toHaveLength(1);
  });

  it("RPC-2 §9.1: sends each request in its own HTTP request", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x1" }));
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    await Promise.all([client.getBlockNumber({ cacheTime: 0 }), client.getCode({ address })]);
    expect(endpoint.posts.map((post) => post.calls.map((call) => call.method))).toEqual([["eth_blockNumber"], ["eth_getCode"]]);
  });

  it("RPC-2 §9.1: a slow request does not hold up or time out a concurrent one", async () => {
    vi.useFakeTimers();
    stubEndpoint((call) => (call.method === "eth_blockNumber" ? "hang" : { result: "0x1" }));
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL }, { retryCount: 0 });
    const slow = expect(client.getBlockNumber({ cacheTime: 0 })).rejects.toThrow(/took too long/);
    const fast = client.getCode({ address });
    await vi.advanceTimersByTimeAsync(0);
    expect(await fast).toBe("0x1");
    await vi.advanceTimersByTimeAsync(20_000);
    await slow;
  });

  it("RPC-1 §9.1: every attempt spends the lookup's budget, retries included", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const budget = createRequestBudget({ maxRequests: 2, deadlineMs: 90_000 });
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL }, { budget });
    const failure = expect(client.getBlockNumber()).rejects.toSatisfy(isLookupLimitError);
    await vi.runAllTimersAsync();
    await failure;
    expect(endpoint.posts).toHaveLength(2);
  });

  it("RPC-1 §9.1: every method spends the budget, not only eth_getLogs", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x1" }));
    const budget = createRequestBudget({ maxRequests: 2, deadlineMs: 90_000 });
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL }, { budget });
    await client.getBlockNumber({ cacheTime: 0 });
    await client.getCode({ address });
    await expect(client.getBlockNumber({ cacheTime: 0 })).rejects.toSatisfy(isLookupLimitError);
    expect(endpoint.posts).toHaveLength(2);
  });

  it("RPC-1 §9.1: no retry starts after the lookup's deadline", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const budget = createRequestBudget({ maxRequests: 1_500, deadlineMs: 1_000 });
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL }, { budget });
    const start = Date.now();
    const failure = expect(client.getBlockNumber()).rejects.toSatisfy(isLookupLimitError);
    await vi.runAllTimersAsync();
    await failure;
    expect(endpoint.posts.map((post) => post.at - start)).toEqual([0, 500]);
  });

  it("RPC-1 §9.1: an exhausted budget fails at once, without waiting for a retry", async () => {
    vi.useFakeTimers();
    const endpoint = stubEndpoint(() => ({ result: "0x1" }));
    const budget = createRequestBudget({ maxRequests: 0, deadlineMs: 90_000 });
    const client = readClient({ REACT_APP_WEB3_PROVIDER_URL: READ_URL }, { budget });
    await expect(client.getBlockNumber()).rejects.toSatisfy(isLookupLimitError);
    expect(endpoint.posts).toHaveLength(0);
  });
});

describe("createReadClients", () => {
  beforeEach(() => {
    stubEndpoint(() => ({ result: "0x1" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("A13: returns one memoized client per configured chain", () => {
    const clients = createReadClients({ REACT_APP_WEB3_PROVIDER_URL: READ_URL, REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://read.rpc.example/gnosis" });
    const mainnet = clients(1);
    expect(mainnet).toBeDefined();
    expect(clients(1)).toBe(mainnet);
    expect(clients(100)).toBeDefined();
    expect(clients(100)).not.toBe(mainnet);
  });

  it("D-56: returns undefined for a configured chain without a read RPC", () => {
    const clients = createReadClients({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    expect(clients(100)).toBeUndefined();
    expect(clients(324)).toBeDefined();
  });

  it("D-18: returns undefined for a chain that is not configured, without throwing", () => {
    const clients = createReadClients({ REACT_APP_WEB3_PROVIDER_URL: READ_URL });
    expect(clients(10)).toBeUndefined();
    expect(clients(5)).toBeUndefined();
    expect(clients(Number.NaN)).toBeUndefined();
  });

  it("A13: each chain's client reads through that chain's own read RPC", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x1" }));
    const clients = createReadClients({ REACT_APP_WEB3_PROVIDER_URL: READ_URL, REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://read.rpc.example/gnosis" });
    await clients(100)?.getBlockNumber();
    expect(endpoint.posts.map((post) => post.url)).toEqual(["https://read.rpc.example/gnosis"]);
  });
});
