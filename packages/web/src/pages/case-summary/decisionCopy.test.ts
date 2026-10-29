import type { Decision, RulingNoun } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { decisionLine } from "./decisionCopy";

const COURT = { ruling: 1n, rulingText: "Yes" };
const OTHER = { ruling: 2n, rulingText: "No" };

describe("decisionLine", () => {
  it.each([
    ["appealable", "This decision can be appealed within the appeal period."],
    ["appealable-in-arbitrable", "This decision can be appealed within the appeal period. Go to the arbitrable application to appeal this ruling."],
    ["not-appealable", "This dispute cannot be appealed."],
    ["not-executed", "The ruling has not been executed yet."],
    ["out-of-range", "The arbitrable contract reported a ruling that is not one of this dispute's options."],
    ["inconsistent", "The arbitrable contract reported conflicting rulings."],
  ] as const)("a jury decision noted %s reads as the spec's line", (note, line) => {
    expect(decisionLine({ kind: "jury-decision", court: COURT, note })).toBe(line);
  });

  it.each([
    ["jury", "option", COURT, "Won by jury decision."],
    ["default", "option", OTHER, "Won by default: “No” was the only option fully funded for the appeal. The court ruled “Yes”."],
    ["default", "answer", OTHER, "Won by default: “No” was the only answer fully funded for the appeal. The court ruled “Yes”."],
    ["default", "list", OTHER, "Won by default: “No” was the only list fully funded for the appeal. The court ruled “Yes”."],
    ["applied", "option", OTHER, "The court ruled “Yes”. The arbitrable contract applied “No”."],
  ] as const)("a winner by %s whose rulings are called %ss reads as the spec's line", (wonBy, noun: RulingNoun, winner, line) => {
    const decision: Decision = { kind: "winner", winner, court: COURT, wonBy, noun };
    expect(decisionLine(decision)).toBe(line);
  });
});
