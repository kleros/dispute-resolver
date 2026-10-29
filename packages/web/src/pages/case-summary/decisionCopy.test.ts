import type { Decision, RulingNoun } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { decisionLine } from "./decisionCopy";

const COURT = { ruling: 1n, rulingText: "Yes" };
const OTHER = { ruling: 2n, rulingText: "No" };

describe("decisionLine", () => {
  it.each([
    ["option", "Won by default: “No” was the only option fully funded for the appeal. The court ruled “Yes”."],
    ["answer", "Won by default: “No” was the only answer fully funded for the appeal. The court ruled “Yes”."],
    ["list", "Won by default: “No” was the only list fully funded for the appeal. The court ruled “Yes”."],
  ] as const)("a winner by default whose rulings are called %ss names them so in its line", (noun: RulingNoun, line) => {
    const decision: Decision = { kind: "winner", winner: OTHER, court: COURT, wonBy: "default", noun };
    expect(decisionLine(decision)).toBe(line);
  });
});
