import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestBudget, isLookupLimitError, LookupLimitError } from "./index";

describe("createRequestBudget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows exactly maxRequests requests, then throws a LookupLimitError", () => {
    const budget = createRequestBudget({ maxRequests: 3, deadlineMs: 90_000 });
    budget.spend();
    budget.spend();
    budget.spend();
    expect(() => {
      budget.spend();
    }).toThrow(LookupLimitError);
  });

  it("keeps refusing once exhausted", () => {
    const budget = createRequestBudget({ maxRequests: 1, deadlineMs: 90_000 });
    budget.spend();
    expect(() => {
      budget.spend();
    }).toThrow(/budget of 1 requests/);
    expect(() => {
      budget.spend();
    }).toThrow(LookupLimitError);
  });

  it("refuses requests after the deadline", () => {
    const budget = createRequestBudget({ maxRequests: 1_500, deadlineMs: 90_000 });
    vi.advanceTimersByTime(90_000);
    budget.spend();
    vi.advanceTimersByTime(1);
    expect(() => {
      budget.spend();
    }).toThrow(/90000 ms deadline/);
  });

  it("the deadline is fixed when the budget is created", () => {
    const budget = createRequestBudget({ maxRequests: 1_500, deadlineMs: 1_000 });
    vi.advanceTimersByTime(400);
    budget.spend();
    expect(budget.remainingMs()).toBe(600);
  });

  it("remainingMs counts down and never goes negative", () => {
    const budget = createRequestBudget({ maxRequests: 1_500, deadlineMs: 90_000 });
    expect(budget.remainingMs()).toBe(90_000);
    vi.advanceTimersByTime(30_000);
    expect(budget.remainingMs()).toBe(60_000);
    vi.advanceTimersByTime(120_000);
    expect(budget.remainingMs()).toBe(0);
  });

  it("the thrown error is recognized as a lookup limit", () => {
    const budget = createRequestBudget({ maxRequests: 0, deadlineMs: 90_000 });
    let thrown: unknown;
    try {
      budget.spend();
    } catch (error) {
      thrown = error;
    }
    expect(isLookupLimitError(thrown)).toBe(true);
  });
});

describe("isLookupLimitError", () => {
  it("is true only for LookupLimitError instances", () => {
    expect(isLookupLimitError(new LookupLimitError("over budget"))).toBe(true);
    expect(isLookupLimitError(new Error("over budget"))).toBe(false);
    expect(isLookupLimitError({ message: "over budget", lookupLimit: true })).toBe(false);
    expect(isLookupLimitError(undefined)).toBe(false);
  });

  it("LookupLimitError is an Error with its own name", () => {
    const error = new LookupLimitError("over budget");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("LookupLimitError");
    expect(error.message).toBe("over budget");
  });
});
