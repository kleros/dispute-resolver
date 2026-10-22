import { numberToHex, toEventSelector } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rpcError } from "../test/rpc/testHelpers";
import { createRequestBudget } from "../rpc";
import type { Hex } from "../types";
import { DISPUTE_ID_TO_QUESTION_ID, LOG_NEW_QUESTION } from "./events";
import { findLatestLogs } from "./findLatestLogs";
import { LOOKUP_LIMITS } from "./constants";
import { fetchRealityQuestion } from "./question";
import { filterOf, mappingLog, nth, questionLog, readClientOf, singleBlockLogs, type FakeChain, type NodeCall } from "../test/reality/testHelpers";
import {
  CROSS_BOUND,
  CROSS_ENTRY,
  CROSS_WITH_BLOCK,
  CROSS_WITH_BLOCK_ENTRY,
  Q_KNOWN_CROSS,
  Q_KNOWN_SINGLE,
  Q_NEW_CROSS,
  Q_NEW_SINGLE,
  REALITY_1,
  REALITY_100,
  SINGLE,
  SINGLE_ENTRY,
  createWorld,
} from "../test/reality/testWorld";

vi.mock("./knownQuestions.generated", async () => {
  const world = await import("../test/reality/testWorld");
  return { REGISTRY_SNAPSHOT_BLOCKS: world.MOCK_REGISTRY_SNAPSHOT_BLOCKS, KNOWN_DISPUTE_QUESTIONS: world.MOCK_KNOWN_DISPUTE_QUESTIONS };
});

const T = {
  map: toEventSelector(DISPUTE_ID_TO_QUESTION_ID),
  question: toEventSelector(LOG_NEW_QUESTION),
};

const hex = (block: bigint | number): Hex => numberToHex(block);

function getLogsCalls(calls: readonly NodeCall[], chainId?: number): NodeCall[] {
  return calls.filter((call) => call.method === "eth_getLogs" && (chainId === undefined || call.chainId === chainId));
}

function countCalls(calls: readonly NodeCall[], predicate: (call: NodeCall) => boolean = () => true): number {
  return calls.filter(predicate).length;
}

/** Fails the first `failures` attempts of every distinct request of `chain`, like a flaky node. */
function failFirstAttempts(chain: FakeChain, failures: number): void {
  const attempts = new Map<string, number>();
  chain.onRequest = (method, params) => {
    const key = JSON.stringify([method, params]);
    const attempted = attempts.get(key) ?? 0;
    attempts.set(key, attempted + 1);
    return attempted < failures ? rpcError(-32000, "header not found") : undefined;
  };
}

/**
 * Moves the clock `ms` forward when `chain` receives its first `method` request, which then fails with `failure` when
 * there is one. Only once, so a request still in flight when the test ends cannot move the clock of a later test.
 */
function advanceClockAtFirst(chain: FakeChain, method: string, ms: number, failure?: Error): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  let advanced = false;
  chain.onRequest = (requested) => {
    const due = requested === method && !advanced;
    if (due) {
      advanced = true;
      vi.setSystemTime(Date.now() + ms);
    }
    return due ? failure : undefined;
  };
}

function lookup(world: ReturnType<typeof createWorld>, entry = SINGLE_ENTRY, disputeId = 7n) {
  return fetchRealityQuestion({ entry, arbitratorChainId: 1, disputeId, clients: world.lookupClients });
}

const windowSize = (call: NodeCall): bigint => BigInt(filterOf(call).toBlock) - BigInt(filterOf(call).fromBlock) + 1n;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fetchRealityQuestion", () => {
  it("looks up a known single-chain dispute with single-block requests only", async () => {
    const world = createWorld();
    const question = await lookup(world);
    expect(question).toEqual({
      questionId: Q_KNOWN_SINGLE,
      templateId: "2",
      templateText: "template 2 on 1",
      questionText: "known single",
      reality: REALITY_1,
      realityChainId: 1,
    });
    expect(world.calls).toHaveLength(3);
    expect(countCalls(world.calls, (call) => call.method === "eth_blockNumber")).toBe(0);
    for (const call of getLogsCalls(world.calls)) {
      expect(filterOf(call).fromBlock).toBe(filterOf(call).toBlock);
      expect(filterOf(call).address).toBe(REALITY_1);
    }
  });

  it("looks up a known cross-chain dispute on the Reality.eth chain only", async () => {
    const world = createWorld();
    const question = await lookup(world, CROSS_ENTRY, 8n);
    expect(question).toMatchObject({ questionId: Q_KNOWN_CROSS, templateId: "3", templateText: "template 3 on 100", questionText: "known cross", realityChainId: 100 });
    expect(world.calls).toHaveLength(3);
    expect(countCalls(world.calls, (call) => call.chainId !== 100)).toBe(0);
  });

  it("rejects a known question whose log does not use the expected template", async () => {
    const world = createWorld();
    world.chains[1].logs[0] = questionLog(REALITY_1, 400_000, Q_KNOWN_SINGLE, 5, "known single");
    await expect(lookup(world)).rejects.toThrow(/template 5, expected 2/);
  });

  it("rejects a known question whose template does not exist", async () => {
    const world = createWorld();
    world.chains[1].templates = {};
    await expect(lookup(world)).rejects.toThrow("Template 2 does not exist.");
  });

  it("searches an unknown single-chain dispute after the snapshot, in windows when the range is refused", async () => {
    const world = createWorld();
    world.chains[1].maxRange = 10_000n;
    const question = await lookup(world, SINGLE_ENTRY, 9n);
    expect(question).toMatchObject({ questionId: Q_NEW_SINGLE, templateId: "2", questionText: "new single" });

    const [, ...rest] = getLogsCalls(world.calls);
    expect(filterOf(nth(getLogsCalls(world.calls), 0))).toMatchObject({ address: SINGLE, fromBlock: hex(500_001), toBlock: hex(900_000) });
    // The mapping search stops at the batch holding the log: [890001, 900000] ... [820001, 830000].
    const mappingWindows = rest.filter((call) => filterOf(call).topics[0] === T.map);
    expect(mappingWindows).toHaveLength(8);
    expect(filterOf(nth(mappingWindows, 0))).toMatchObject({ fromBlock: hex(890_001), toBlock: hex(900_000) });
    // The question search starts from the mapping event's block, not from the chain head, and goes straight to the
    // windows since this provider already refused a larger range.
    const questionCalls = rest.filter((call) => filterOf(call).topics[0] === T.question);
    expect(filterOf(nth(questionCalls, 0))).toMatchObject({ address: REALITY_1, fromBlock: hex(840_001), toBlock: hex(850_000) });
  });

  it("tries the whole range first on a provider that has not refused a range yet", async () => {
    const world = createWorld();
    world.chains[100].maxRange = 100_000n;
    await lookup(world, CROSS_ENTRY, 10n);
    const questionCalls = getLogsCalls(world.calls, 100).filter((call) => filterOf(call).topics[0] === T.question);
    expect(filterOf(nth(questionCalls, 0))).toMatchObject({ address: REALITY_100, fromBlock: hex(100), toBlock: hex(CROSS_BOUND) });
    expect(filterOf(nth(questionCalls, 1))).toMatchObject({ fromBlock: hex(CROSS_BOUND - 9999n), toBlock: hex(CROSS_BOUND) });
  });

  it("shrinks the windows while the provider still refuses them", async () => {
    const world = createWorld();
    world.chains[1].maxRange = 500n;
    const question = await lookup(world, SINGLE_ENTRY, 9n);
    expect(question.questionId).toBe(Q_NEW_SINGLE);
    const sizes = getLogsCalls(world.calls).map(windowSize);
    expect(sizes).toEqual(expect.arrayContaining([10_000n, 2000n, 400n]));
    expect(Math.max(...sizes.slice(sizes.findIndex((size) => size === 400n)).map(Number))).toBeLessThanOrEqual(400);
  });

  it("throws when the provider refuses even the smallest window", async () => {
    const world = createWorld();
    world.chains[1].maxRange = 50n;
    await expect(lookup(world, SINGLE_ENTRY, 9n)).rejects.toThrow(/max block range/);
  });

  it("retries other errors a couple of times and throws them without splitting the range", async () => {
    const world = createWorld();
    world.chains[1].onRequest = (method) => (method === "eth_getLogs" ? rpcError(-32000, "internal server error") : undefined);
    await expect(lookup(world, SINGLE_ENTRY, 9n)).rejects.toThrow("internal server error");
    const logCalls = getLogsCalls(world.calls);
    expect(logCalls).toHaveLength(3);
    for (const call of logCalls) expect(filterOf(call)).toMatchObject({ fromBlock: hex(500_001) });
  });

  it("does not mistake rate limiting for a range limit", async () => {
    const world = createWorld();
    let limited = 2;
    world.chains[1].onRequest = (method) => (method === "eth_getLogs" && limited-- > 0 ? rpcError(-32005, "rate limit exceeded") : undefined);
    const question = await lookup(world, SINGLE_ENTRY, 9n);
    expect(question.questionId).toBe(Q_NEW_SINGLE);
    // 2 rate-limited + mapping + question (both over their whole range) + template.
    expect(getLogsCalls(world.calls)).toHaveLength(5);
  });

  it("throws once the request budget is exhausted", async () => {
    const world = createWorld();
    world.chains[1].maxRange = 100n;
    world.chains[1].logs = world.chains[1].logs.filter((log) => log.topics[0] !== T.map);
    await expect(lookup(world, SINGLE_ENTRY, 9n)).rejects.toThrow(/budget of 1500 requests/);
    expect(world.calls.length).toBeLessThanOrEqual(LOOKUP_LIMITS.requestBudget);
  });

  it("throws once the deadline is exceeded", async () => {
    const world = createWorld();
    world.chains[1].maxRange = 100n;
    await expect(fetchRealityQuestion({ entry: SINGLE_ENTRY, arbitratorChainId: 1, disputeId: 9n, clients: world.lookupClients, deadlineMs: -1 })).rejects.toThrow(/deadline/);
    expect(world.calls).toHaveLength(0);
  });

  it("clips the requested deadline to the lookup limit", async () => {
    const world = createWorld();
    advanceClockAtFirst(world.chains[1], "eth_blockNumber", LOOKUP_LIMITS.deadlineMs + 1);
    await expect(
      fetchRealityQuestion({ entry: SINGLE_ENTRY, arbitratorChainId: 1, disputeId: 9n, clients: world.lookupClients, deadlineMs: Number.MAX_SAFE_INTEGER }),
    ).rejects.toThrow(/deadline/);
    expect(getLogsCalls(world.calls)).toHaveLength(0);
  });

  it("keeps a requested deadline shorter than the lookup limit", async () => {
    const world = createWorld();
    advanceClockAtFirst(world.chains[1], "eth_blockNumber", 1001);
    await expect(fetchRealityQuestion({ entry: SINGLE_ENTRY, arbitratorChainId: 1, disputeId: 9n, clients: world.lookupClients, deadlineMs: 1000 })).rejects.toThrow(/deadline/);
  });

  it("counts the retries of a request against the request budget", async () => {
    const limits = { ...LOOKUP_LIMITS };
    Object.assign(LOOKUP_LIMITS, { requestBudget: 3 });
    try {
      const world = createWorld();
      failFirstAttempts(world.chains[1], 2);
      await expect(lookup(world)).rejects.toThrow(/budget of 3 requests/);
      expect(world.calls.length).toBeLessThanOrEqual(3);
    } finally {
      Object.assign(LOOKUP_LIMITS, limits);
    }
  });

  it("succeeds within the budget when requests need retries, sending every attempt", async () => {
    const world = createWorld();
    failFirstAttempts(world.chains[1], 2);
    expect((await lookup(world)).questionId).toBe(Q_KNOWN_SINGLE);
    expect(world.calls).toHaveLength(9);
  });

  it("stops retrying once the deadline has passed", async () => {
    const world = createWorld();
    advanceClockAtFirst(world.chains[1], "eth_getLogs", LOOKUP_LIMITS.deadlineMs + 1, rpcError(-32000, "internal server error"));
    await expect(lookup(world)).rejects.toThrow(/deadline/);
    expect(getLogsCalls(world.calls).length).toBeLessThanOrEqual(2);
  });

  it("searches the question of an unknown cross-chain dispute back from the arbitration creation time", async () => {
    const world = createWorld();
    world.chains[100].maxRange = 100_000n;
    const question = await lookup(world, CROSS_ENTRY, 10n);
    expect(question).toMatchObject({ questionId: Q_NEW_CROSS, templateText: "template 3 on 100", realityChainId: 100 });
    const questionCalls = getLogsCalls(world.calls, 100).filter((call) => filterOf(call).topics[0] === T.question);
    expect(filterOf(nth(questionCalls, questionCalls.length - 1))).toMatchObject({ toBlock: hex(CROSS_BOUND - 7n * 10_000n) });
    expect(questionCalls).toHaveLength(9); // The whole range, then a batch of 8 windows.
    expect(countCalls(world.calls, (call) => call.method === "eth_getBlockByNumber")).toBeLessThanOrEqual(3 + 8);
  });

  it("searches the question of an unknown cross-chain dispute back from the Reality.eth chain head as a fallback", async () => {
    const world = createWorld();
    world.chains[1].onRequest = (method) => (method === "eth_getBlockByNumber" ? rpcError(-32000, "header not found") : undefined);
    const question = await lookup(world, CROSS_ENTRY, 10n);
    expect(question.questionId).toBe(Q_NEW_CROSS);
    const questionCall = nth(
      getLogsCalls(world.calls, 100).filter((call) => filterOf(call).topics[0] === T.question),
      0,
    );
    expect(filterOf(questionCall)).toMatchObject({ fromBlock: hex(100), toBlock: hex(3_000_000) });
  });

  it("uses arbitrationCreatedBlock when the proxy has it", async () => {
    const world = createWorld();
    const question = await lookup(world, CROSS_WITH_BLOCK_ENTRY, 11n);
    expect(question.questionId).toBe(Q_NEW_CROSS);
    const mapping = getLogsCalls(world.calls, 1);
    expect(mapping).toHaveLength(1);
    expect(filterOf(nth(mapping, 0))).toMatchObject({ address: CROSS_WITH_BLOCK, fromBlock: hex(870_000), toBlock: hex(870_000) });
  });

  it("falls back to the scan when arbitrationCreatedBlock fails", async () => {
    const world = createWorld();
    world.chains[1].onRequest = (method) => (method === "eth_call" ? rpcError(-32000, "header not found") : undefined);
    const question = await lookup(world, CROSS_WITH_BLOCK_ENTRY, 11n);
    expect(question.questionId).toBe(Q_NEW_CROSS);
    expect(filterOf(nth(getLogsCalls(world.calls, 1), 0))).toMatchObject({ fromBlock: hex(500_001) });
  });

  it("reads arbitrationCreatedBlock once, without retries", async () => {
    const world = createWorld();
    world.chains[1].onRequest = (method) => (method === "eth_call" ? rpcError(-32000, "header not found") : undefined);
    await lookup(world, CROSS_WITH_BLOCK_ENTRY, 11n);
    expect(countCalls(world.calls, (call) => call.chainId === 1 && call.method === "eth_call")).toBe(1);
  });

  it("falls back to the scan when the arbitrationCreatedBlock getLogs fails", async () => {
    const world = createWorld();
    world.chains[1].onRequest = (method, params) => (singleBlockLogs(method, params) ? rpcError(-32000, "unknown block") : undefined);
    const question = await lookup(world, CROSS_WITH_BLOCK_ENTRY, 11n);
    expect(question.questionId).toBe(Q_NEW_CROSS);
  });

  it("deduplicates logs returned twice", async () => {
    const world = createWorld();
    world.chains[1].duplicateLogs = true;
    const question = await lookup(world, SINGLE_ENTRY, 9n);
    expect(question.questionId).toBe(Q_NEW_SINGLE);
  });

  it("rejects distinct duplicate mapping logs", async () => {
    const world = createWorld();
    world.chains[1].logs.push(mappingLog(SINGLE, 860_000, 9, `0x${"05".repeat(32)}`));
    await expect(lookup(world, SINGLE_ENTRY, 9n)).rejects.toThrow("Expected exactly one DisputeIDToQuestionID log, found 2.");
  });

  it("rejects an unknown dispute without mapping log", async () => {
    const world = createWorld();
    await expect(lookup(world, SINGLE_ENTRY, 12n)).rejects.toThrow("found 0");
  });

  it("rejects a negative dispute ID without a request", async () => {
    const world = createWorld();
    await expect(lookup(world, SINGLE_ENTRY, -1n)).rejects.toThrow("Invalid dispute ID -1.");
    expect(world.calls).toHaveLength(0);
  });

  it("names the arbitrator chain when it has no read client", async () => {
    const world = createWorld();
    await expect(fetchRealityQuestion({ entry: SINGLE_ENTRY, arbitratorChainId: 10, disputeId: 7n, clients: world.lookupClients })).rejects.toThrow(
      "reads on chain 10 are unavailable",
    );
    expect(world.calls).toHaveLength(0);
  });

  it("names the Reality.eth chain when it has no read client", async () => {
    const world = createWorld();
    await expect(
      fetchRealityQuestion({
        entry: CROSS_ENTRY,
        arbitratorChainId: 1,
        disputeId: 8n,
        clients: (budget, options) => (chainId) => (chainId === 1 ? world.lookupClients(budget, options)(1) : undefined),
      }),
    ).rejects.toThrow("reads on chain 100 are unavailable");
    expect(world.calls).toHaveLength(0);
  });

  it("shares concurrent lookups of the same dispute", async () => {
    const world = createWorld();
    const [a, b, c] = await Promise.all([lookup(world), lookup(world), lookup(world, CROSS_ENTRY, 8n)]);
    expect(a).toBe(b);
    expect(c.questionId).toBe(Q_KNOWN_CROSS);
    expect(world.calls).toHaveLength(6);
  });

  it("lets an aborting caller stop waiting without failing the caller sharing its lookup", async () => {
    const world = createWorld();
    const first = new AbortController();
    const aborted = fetchRealityQuestion({ entry: SINGLE_ENTRY, arbitratorChainId: 1, disputeId: 7n, clients: world.lookupClients, signal: first.signal });
    const shared = lookup(world);
    first.abort(new Error("navigated away"));
    await expect(aborted).rejects.toThrow("navigated away");
    expect((await shared).questionId).toBe(Q_KNOWN_SINGLE);
  });

  it("stops the lookup before its next request once every caller aborts", async () => {
    const world = createWorld();
    const controller = new AbortController();
    world.chains[1].onRequest = (method) => {
      if (method === "eth_blockNumber") controller.abort();
      return undefined;
    };
    await expect(fetchRealityQuestion({ entry: SINGLE_ENTRY, arbitratorChainId: 1, disputeId: 9n, clients: world.lookupClients, signal: controller.signal })).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getLogsCalls(world.calls)).toHaveLength(0);
  });

  it("rejects an already aborted signal before any request", async () => {
    const world = createWorld();
    await expect(
      fetchRealityQuestion({ entry: SINGLE_ENTRY, arbitratorChainId: 1, disputeId: 7n, clients: world.lookupClients, signal: AbortSignal.abort(new Error("stop")) }),
    ).rejects.toThrow("stop");
    expect(world.calls).toHaveLength(0);
  });
});

describe("findLatestLogs", () => {
  const budget = () => createRequestBudget({ maxRequests: 100, deadlineMs: 60_000 });
  const request = { address: SINGLE, event: DISPUTE_ID_TO_QUESTION_ID, args: { _disputeID: 9n }, fromBlock: 500_001n, toBlock: 900_000n } as const;

  it("returns no logs for an empty range without requests", async () => {
    const world = createWorld();
    expect(await findLatestLogs(readClientOf(world.clients, 1), { ...request, fromBlock: 10n, toBlock: 9n }, budget())).toEqual([]);
    expect(world.calls).toHaveLength(0);
  });

  it("returns the logs of the newest window that has any", async () => {
    const world = createWorld();
    world.chains[1].maxRange = 10_000n;
    const logs = await findLatestLogs(readClientOf(world.clients, 1), request, budget());
    expect(logs).toHaveLength(1);
    expect(logs[0]?.args._questionID).toBe(Q_NEW_SINGLE);
  });

  it("spends the budget on every request", async () => {
    const world = createWorld();
    world.chains[1].maxRange = 100n;
    await expect(findLatestLogs(readClientOf(world.clients, 1), request, createRequestBudget({ maxRequests: 5, deadlineMs: 60_000 }))).rejects.toThrow(/budget of 5 requests/);
    expect(world.calls).toHaveLength(5);
  });
});
