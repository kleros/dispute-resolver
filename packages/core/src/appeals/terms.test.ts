import { describe, expect, it } from "vitest";
import { losingDeadline, losingSideDeadline } from "./index";
import type { AppealPanel, FundingTerms } from "./types";

const END = 2_000_000;
const TERMS: FundingTerms = { noun: "answer", tie: null, appealPeriodEnd: END, loserDeadline: 1_500_000 };

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

describe("losingSideDeadline", () => {
  const CROWDFUNDING_SET = { dialect: "idr", cards: [], freeInput: null, composer: null } as const;
  const UNAVAILABLE = { code: "rpc-error", message: "The fees could not be read." } as const;

  it.each<[string, AppealPanel]>([
    ["crowdfunded appeals", { kind: "crowdfunding", terms: TERMS, ...CROWDFUNDING_SET }],
    ["a product appealed in its own application whose funding times are known", { kind: "handled-by-arbitrable", terms: TERMS }],
  ])("gives the losing side's own earlier time for %s", (_case, panel) => {
    expect(losingSideDeadline(panel)).toEqual({ kind: "deadline", at: 1_500_000 });
  });

  it("keeps the losing side's time for a tie where refusing to arbitrate is the winner", () => {
    expect(losingSideDeadline({ kind: "crowdfunding", terms: { ...TERMS, tie: "refuse-is-winner" }, ...CROWDFUNDING_SET })).toEqual({ kind: "deadline", at: 1_500_000 });
  });

  it.each<[string, FundingTerms]>([
    ["a tie that shares the whole period", { ...TERMS, tie: "shared-full-period" }],
    ["a tie that costs every option as a winner", { ...TERMS, tie: "all-winner" }],
    ["losing rulings closing at the appeal period's end", { ...TERMS, loserDeadline: END }],
    ["losing rulings closing after the appeal period's end", { ...TERMS, loserDeadline: END + 1 }],
  ])("gives no losing side's time for %s, crowdfunded or appealed in its own application", (_case, terms) => {
    expect(losingSideDeadline({ kind: "crowdfunding", terms, ...CROWDFUNDING_SET })).toBeNull();
    expect(losingSideDeadline({ kind: "handled-by-arbitrable", terms })).toBeNull();
  });

  it.each<[string, AppealPanel]>([
    ["a product appealed in its own application without known funding times", { kind: "handled-by-arbitrable" }],
    ["an arbitrable whose funding rules are not supported", { kind: "funding-unsupported" }],
    ["appeal fees that could not be calculated", { kind: "fees-unavailable", error: UNAVAILABLE }],
  ])("says the losing side's time is unknown for %s", (_case, panel) => {
    expect(losingSideDeadline(panel)).toEqual({ kind: "unknown" });
  });

  it.each<[string, AppealPanel]>([
    ["a hidden appeal", { kind: "hidden" }],
    ["an arbitrable that cannot be appealed", { kind: "not-appealable" }],
    ["an escrow appeal", { kind: "escrow-appeal", appealCost: 1n, deadline: END }],
    ["an escrow appeal that ended", { kind: "escrow-ended" }],
    ["withdrawals", { kind: "withdraw", state: { status: "nothing" }, noun: "answer" }],
    ["withdrawals this app does not support", { kind: "withdraw-unsupported" }],
  ])("gives no losing side's time for %s", (_case, panel) => {
    expect(losingSideDeadline(panel)).toBeNull();
  });
});
