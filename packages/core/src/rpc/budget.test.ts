import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestBudget, LookupLimitError } from "./index";

describe("createRequestBudget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows exactly maxRequests requests, then keeps refusing with a LookupLimitError", () => {
    const budget = createRequestBudget({ maxRequests: 3, deadlineMs: 90_000 });
    budget.spend();
    budget.spend();
    budget.spend();
    expect(() => {
      budget.spend();
    }).toThrow(/budget of 3 requests/);
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

  it("remainingMs counts down and never goes negative", () => {
    const budget = createRequestBudget({ maxRequests: 1_500, deadlineMs: 90_000 });
    expect(budget.remainingMs()).toBe(90_000);
    vi.advanceTimersByTime(30_000);
    expect(budget.remainingMs()).toBe(60_000);
    vi.advanceTimersByTime(120_000);
    expect(budget.remainingMs()).toBe(0);
  });
});
