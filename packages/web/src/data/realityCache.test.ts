import type { RealityQuestion } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../test/data";
import { createRealityQuestionCache } from "./realityCache";

const KEY = "@@kleros/court/reality-question/v1/1/0x2f0895732bfacdcf2fdb19962fe609d0da695f21/1650";
const QUESTION: RealityQuestion = {
  questionId: "0x01",
  templateId: "2",
  templateText: "{}",
  questionText: "Who won?␟Harris,Trump␟news",
  reality: "0x5b7dd1e86623548af054a4985f7fc8ccbb554e2c",
  realityChainId: 1,
};

describe("Reality question cache", () => {
  it("stores under core's key and returns the stored value as unknown for core to validate", () => {
    const storage = createMemoryStorage();
    const cache = createRealityQuestionCache(storage);
    cache.set(KEY, QUESTION);
    expect(storage.entries.get(KEY)).toBe(JSON.stringify(QUESTION));
    expect(cache.get(KEY)).toEqual(QUESTION);
    cache.remove(KEY);
    expect(cache.get(KEY)).toBeUndefined();
  });

  it("reads an entry that is not JSON as absent", () => {
    const cache = createRealityQuestionCache(createMemoryStorage({ [KEY]: "{oops" }));
    expect(cache.get(KEY)).toBeUndefined();
  });

  it("never lets a storage that throws reach the caller", () => {
    const storage = createMemoryStorage({ [KEY]: JSON.stringify(QUESTION) });
    storage.failing = true;
    const cache = createRealityQuestionCache(storage);
    expect(cache.get(KEY)).toBeUndefined();
    expect(() => {
      cache.set(KEY, QUESTION);
    }).not.toThrow();
    expect(() => {
      cache.remove(KEY);
    }).not.toThrow();
  });

  it("holds nothing without a storage", () => {
    const cache = createRealityQuestionCache(undefined);
    cache.set(KEY, QUESTION);
    expect(cache.get(KEY)).toBeUndefined();
  });
});
