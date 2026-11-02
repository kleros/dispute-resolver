import { describe, expect, it } from "vitest";
import { losingDeadline } from "./index";
import type { FundingTerms } from "./types";

const END = 2_000_000;
const TERMS: FundingTerms = { noun: "option", tie: null, appealPeriodEnd: END, loserDeadline: 1_500_000 };

describe("losingDeadline", () => {
  it("gives the losing rulings their own earlier time", () => {
    expect(losingDeadline(TERMS)).toBe(1_500_000);
  });

  it("keeps the losing rulings' time a second before the appeal period ends", () => {
    expect(losingDeadline({ ...TERMS, loserDeadline: END - 1 })).toBe(END - 1);
  });

  it("gives a tie where refusing to arbitrate is the winner two times, as its cards do", () => {
    expect(losingDeadline({ ...TERMS, tie: "refuse-is-winner" })).toBe(1_500_000);
  });

  it.each(["shared-full-period", "all-winner"] as const)("gives a %s tie one time: every ruling is funded until the end", (tie) => {
    expect(losingDeadline({ ...TERMS, tie })).toBeNull();
  });

  it("gives one time when the losing rulings close at the appeal period's end", () => {
    expect(losingDeadline({ ...TERMS, loserDeadline: END })).toBeNull();
  });

  it("gives one time when the losing rulings' time lies after the appeal period's end", () => {
    expect(losingDeadline({ ...TERMS, loserDeadline: END + 1 })).toBeNull();
  });
});
