import type { Decision, RulingNoun } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { decisionLine } from "./decisionCopy";

const COURT = { ruling: 1n, rulingText: "Yes" };
const OTHER = { ruling: 2n, rulingText: "No" };
const UNNAMED_COURT = { ruling: 1n, rulingText: "" };
const UNNAMED_OTHER = { ruling: 2n, rulingText: "" };
const BLANK_COURT = { ruling: 1n, rulingText: " " };
const BLANK_OTHER = { ruling: 2n, rulingText: "  " };

describe("decisionLine", () => {
  it.each([
    ["answer", "Won by default: “No” was the only answer fully funded for the appeal. The court ruled “Yes”."],
    ["list", "Won by default: “No” was the only list fully funded for the appeal. The court ruled “Yes”."],
  ] as const)("a winner by default whose rulings are called %ss names them so in its line", (noun: RulingNoun, line) => {
    const decision: Decision = { kind: "winner", winner: OTHER, court: COURT, wonBy: "default", noun };
    expect(decisionLine(decision)).toBe(line);
  });

  it.each([
    ["the winner", UNNAMED_OTHER, COURT, "Won by default as the only answer fully funded for the appeal. The court ruled “Yes”."],
    ["the court's ruling", OTHER, UNNAMED_COURT, "Won by default: “No” was the only answer fully funded for the appeal."],
    ["both rulings", UNNAMED_OTHER, UNNAMED_COURT, "Won by default as the only answer fully funded for the appeal."],
  ] as const)("a winner by default drops the quote of %s when it reads as nothing", (_case, winner, court, line) => {
    expect(decisionLine({ kind: "winner", winner, court, wonBy: "default", noun: "answer" })).toBe(line);
  });

  it.each([
    ["the applied ruling", UNNAMED_OTHER, COURT, "The court ruled “Yes”. The arbitrable contract applied a ruling other than the court's."],
    ["the court's ruling", OTHER, UNNAMED_COURT, "The arbitrable contract applied “No”."],
    ["both rulings", UNNAMED_OTHER, UNNAMED_COURT, "The arbitrable contract applied a ruling other than the court's."],
  ] as const)("a ruling the arbitrable applied drops the quote of %s when it reads as nothing", (_case, winner, court, line) => {
    expect(decisionLine({ kind: "winner", winner, court, wonBy: "applied", noun: "answer" })).toBe(line);
  });

  it.each([
    ["won by default", "default", "Won by default as the only answer fully funded for the appeal."],
    ["applied by the arbitrable", "applied", "The arbitrable contract applied a ruling other than the court's."],
  ] as const)("rulings titled with spaces only read as nothing when %s", (_case, wonBy, line) => {
    expect(decisionLine({ kind: "winner", winner: BLANK_OTHER, court: BLANK_COURT, wonBy, noun: "answer" })).toBe(line);
  });

  it("names both rulings when the arbitrable applied another one than the court's", () => {
    expect(decisionLine({ kind: "winner", winner: OTHER, court: COURT, wonBy: "applied", noun: "answer" })).toBe("The court ruled “Yes”. The arbitrable contract applied “No”.");
  });
});
