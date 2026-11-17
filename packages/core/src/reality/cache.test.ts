import { afterEach, describe, expect, it, vi } from "vitest";
import { rpcError } from "../test/rpc/testHelpers";
import { isValidCachedQuestion, realityQuestionCacheKey } from "./cache";
import { fetchRealityQuestion } from "./question";
import { CROSS_ENTRY, KEY_7, MOCK_KNOWN_DISPUTE_QUESTIONS, Q_KNOWN_SINGLE, Q_NEW_SINGLE, REALITY_1, REALITY_100, SINGLE_ENTRY, createWorld } from "../test/reality/testWorld";
import type { RealityQuestion, RealityQuestionCache } from "./types";

vi.mock("./knownQuestions.generated", async () => {
  const world = await import("../test/reality/testWorld");
  return { REGISTRY_SNAPSHOT_BLOCKS: world.MOCK_REGISTRY_SNAPSHOT_BLOCKS, KNOWN_DISPUTE_QUESTIONS: world.MOCK_KNOWN_DISPUTE_QUESTIONS };
});

const KNOWN_SINGLE = MOCK_KNOWN_DISPUTE_QUESTIONS[`1:${SINGLE_ENTRY.proxy}:7`];

const VALID: RealityQuestion = {
  questionId: Q_KNOWN_SINGLE,
  templateId: "2",
  templateText: "t",
  questionText: "q",
  reality: REALITY_1,
  realityChainId: 1,
};

function memoryCache(initial: Readonly<Record<string, unknown>> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  const removed: string[] = [];
  const cache: RealityQuestionCache = {
    get: (key) => store.get(key),
    set: (key, question) => {
      store.set(key, question);
    },
    remove: (key) => {
      removed.push(key);
      store.delete(key);
    },
  };
  return { cache, store, removed };
}

function lookup(world: ReturnType<typeof createWorld>, cache: RealityQuestionCache) {
  return fetchRealityQuestion({ entry: SINGLE_ENTRY, arbitratorChainId: 1, disputeId: 7n, clients: world.lookupClients, cache });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("realityQuestionCacheKey", () => {
  it("builds the stored key from chain, proxy and dispute ID", () => {
    expect(realityQuestionCacheKey(1, SINGLE_ENTRY, 7n)).toBe(KEY_7);
    expect(realityQuestionCacheKey(1, CROSS_ENTRY, 10n)).toBe(`@@kleros/court/reality-question/v1/1/${CROSS_ENTRY.proxy}/10`);
  });
});

describe("isValidCachedQuestion", () => {
  it("accepts a question matching the entry", () => {
    expect(isValidCachedQuestion(VALID, SINGLE_ENTRY, undefined)).toBe(true);
    expect(isValidCachedQuestion(VALID, SINGLE_ENTRY, KNOWN_SINGLE)).toBe(true);
    expect(isValidCachedQuestion({ ...VALID, templateId: "20" }, SINGLE_ENTRY, undefined)).toBe(true);
  });

  it.each([
    ["after", `${Q_KNOWN_SINGLE}00`],
    ["before", `x${Q_KNOWN_SINGLE}`],
  ])("rejects a question ID with characters %s it when no question is known", (_where, questionId) => {
    expect(isValidCachedQuestion({ ...VALID, questionId }, SINGLE_ENTRY, undefined)).toBe(false);
  });

  it("compares the known question ID case-insensitively", () => {
    const upper = { ...VALID, questionId: `0x${"01".repeat(32)}`.toUpperCase().replace("0X", "0x") };
    expect(isValidCachedQuestion(upper, SINGLE_ENTRY, KNOWN_SINGLE)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "{"],
    ["an array", [VALID]],
    ["missing fields", { questionId: Q_KNOWN_SINGLE }],
    ["a short question ID", { ...VALID, questionId: "0x01" }],
    ["a template ID that is not decimal", { ...VALID, templateId: "0x2" }],
    ["a numeric template ID", { ...VALID, templateId: 2 }],
    ["a non-string template text", { ...VALID, templateText: 3 }],
    ["another question than the known one", { ...VALID, questionId: Q_NEW_SINGLE }],
    ["another Reality.eth contract", { ...VALID, reality: REALITY_100 }],
    ["another chain", { ...VALID, realityChainId: 100 }],
  ])("rejects %s", (_name, value) => {
    expect(isValidCachedQuestion(value, SINGLE_ENTRY, KNOWN_SINGLE)).toBe(false);
  });
});

describe("fetchRealityQuestion cache", () => {
  it("serves a cached question without requests", async () => {
    const world = createWorld();
    const { cache, store } = memoryCache();
    const first = await lookup(world, cache);
    expect(store.get(KEY_7)).toEqual(first);
    world.calls.length = 0;
    const second = await lookup(world, cache);
    expect(second).toEqual(first);
    expect(world.calls).toHaveLength(0);
  });

  it.each([
    ["unparsable", "{"],
    ["missing fields", { questionId: Q_KNOWN_SINGLE }],
    ["another question than the known one", { ...VALID, questionId: Q_NEW_SINGLE }],
    ["another Reality.eth contract", { ...VALID, reality: REALITY_100 }],
  ])("drops an invalid entry (%s) and fetches again", async (_name, value) => {
    const world = createWorld();
    const { cache, store, removed } = memoryCache({ [KEY_7]: value });
    const question = await lookup(world, cache);
    expect(question.questionText).toBe("known single");
    expect(removed).toEqual([KEY_7]);
    expect(world.calls).toHaveLength(3);
    expect(store.get(KEY_7)).toEqual(question);
  });

  it("removes nothing when no entry is cached", async () => {
    const world = createWorld();
    const { cache, removed } = memoryCache();
    await lookup(world, cache);
    expect(removed).toEqual([]);
  });

  it("does not cache a failed lookup", async () => {
    const world = createWorld();
    world.chains[1].onRequest = () => rpcError(-32000, "down");
    const { cache, store } = memoryCache();
    await expect(lookup(world, cache)).rejects.toThrow();
    expect(store.has(KEY_7)).toBe(false);
  });

  const denied = (): never => {
    throw new Error("denied");
  };

  it.each<[string, RealityQuestionCache]>([
    ["storage throws", { get: denied, set: denied, remove: denied }],
    ["an invalid entry cannot be removed", { get: () => "{", set: denied, remove: denied }],
  ])("looks the question up when %s", async (_case, cache) => {
    const question = await lookup(createWorld(), cache);
    expect(question.questionId).toBe(Q_KNOWN_SINGLE);
  });
});
