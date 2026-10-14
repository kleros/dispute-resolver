import { describe, expect, it } from "vitest";
import { LOOKUP_LIMITS, QUESTION_PARAMS_DELIMITER } from "./constants";

describe("the lookup constants", () => {
  it("A5: LOOKUP_LIMITS are the tunables of spec 9.1", () => {
    expect(LOOKUP_LIMITS).toEqual({
      requestTimeoutMs: 20_000,
      deadlineMs: 90_000,
      requestBudget: 1500,
      retryDelaysMs: [500, 2000],
      windowSize: 10_000,
      minWindowSize: 100,
      windowShrinkFactor: 5,
      concurrency: 8,
    });
  });

  it("A5: question parameters are separated by U+241F", () => {
    expect(QUESTION_PARAMS_DELIMITER).toBe("␟");
    expect(QUESTION_PARAMS_DELIMITER.codePointAt(0)).toBe(0x241f);
  });
});
