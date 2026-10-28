import type { AppealRoute, Decision, ExecutionNote, JuryRuling, RulingNoun, Settlement, ZeroRulingReason } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { decisionLines } from "./decisionCopy";

type ShownDecision = Exclude<Decision, { readonly kind: "none" }>;

const YES: JuryRuling = { ruling: 1n, rulingText: "Yes", zeroReason: null };
const NO = { ruling: 2n, rulingText: "No" };

function refused(zeroReason: ZeroRulingReason | null): JuryRuling {
  return { ruling: 0n, rulingText: "invalid / refused to arbitrate / tied", zeroReason };
}

function appealPeriod(route: AppealRoute | null, options: { verified?: boolean; settlement?: Settlement; noun?: RulingNoun; jury?: JuryRuling } = {}): ShownDecision {
  return {
    kind: "jury-decision",
    jury: options.jury ?? YES,
    route,
    verified: options.verified ?? false,
    settlement: options.settlement ?? "unknown",
    noun: options.noun ?? "option",
  };
}

function winner(
  wonBy: "jury" | "default" | "reported",
  execution: "executed" | "pending" | "unconfirmed",
  options: { note?: ExecutionNote; jury?: JuryRuling } = {},
): ShownDecision {
  const jury = options.jury ?? YES;
  return {
    kind: "winner",
    winner: wonBy === "jury" ? jury : NO,
    jury,
    wonBy,
    verified: wonBy === "default",
    execution,
    note: options.note ?? null,
    noun: "option",
  };
}

describe("decision copy in the appeal period", () => {
  it.each([
    [
      "a verified contract where the only fully funded option wins",
      appealPeriod("crowdfunding", { verified: true, settlement: "sole-funded-wins" }),
      "This ruling can still change. If only one option is fully funded before its funding closes, that option wins, whatever the jury ruled. If two options are fully funded, the case goes to new jurors.",
    ],
    [
      "a verified contract where the jury's ruling stands",
      appealPeriod("crowdfunding", { verified: true, settlement: "jury-stands" }),
      "This ruling changes only if two options are fully funded before their funding closes: the case then goes to new jurors. If only one option is fully funded, the jury's ruling stands.",
    ],
    [
      "a contract whose rules are not verified",
      appealPeriod("crowdfunding"),
      "This ruling can be appealed by funding it below. The Dispute Resolver has not verified this contract's rules, so what happens if only one option is fully funded depends on the contract.",
    ],
    [
      "a verified escrow",
      appealPeriod("escrow", { verified: true, settlement: "jury-stands" }),
      "This ruling can be appealed here by paying the appeal cost until the dispute moves to execution; new jurors then decide.",
    ],
    [
      "an escrow whose rules are not verified",
      appealPeriod("escrow"),
      "This ruling can be appealed here by paying the appeal cost while the appeal period is open. The Dispute Resolver has not verified this contract's rules.",
    ],
    [
      "an arbitrable whose appeals, if any, are its own",
      appealPeriod("arbitrable"),
      "Whether and how this decision can be appealed depends on the arbitrable contract. If it can, it is done in the arbitrable application.",
    ],
    [
      "a contract whose funding is not supported",
      appealPeriod("unsupported", { verified: true, settlement: "sole-funded-wins" }),
      "This decision can be appealed within the appeal period, but the Dispute Resolver cannot fund appeals on this contract.",
    ],
    [
      "a contract with no appeal",
      appealPeriod("none", { verified: true, noun: "answer" }),
      "This arbitrable contract has no appeal: the ruling becomes final when the appeal period ends.",
    ],
    ["an unknown family", appealPeriod(null), "Whether and how this decision can be appealed depends on the arbitrable contract."],
  ])("says how %s is appealed", (_case, decision, line) => {
    expect(decisionLines(decision)).toEqual([line]);
  });

  it("names the governor's lists and the Reality answers by their own nouns", () => {
    expect(decisionLines(appealPeriod("crowdfunding", { verified: true, settlement: "sole-funded-wins", noun: "list" }))[0]).toContain(
      "If only one list is fully funded before its funding closes, that list wins, whatever the jury ruled. If two lists are fully funded",
    );
    expect(decisionLines(appealPeriod("crowdfunding", { noun: "answer" }))[0]).toContain("what happens if only one answer is fully funded");
  });

  it.each([
    ["tie", "The jurors' vote was tied, so the court's ruling is Refuse to Arbitrate."],
    ["no-votes", "No juror voted in this round, so the court's ruling is Refuse to Arbitrate."],
    ["refused", "The jurors voted to refuse to arbitrate."],
    [null, "The jury refused to arbitrate or reached no majority: a tied vote, or no votes, also gives this ruling."],
  ] as const)("explains a ruling of 0 whose cause is %s before the appeal line", (reason, line) => {
    const lines = decisionLines(appealPeriod("arbitrable", { jury: refused(reason) }));
    expect(lines).toEqual([line, "Whether and how this decision can be appealed depends on the arbitrable contract. If it can, it is done in the arbitrable application."]);
  });

  it("promises an appeal only where the registry or the contract's own functions show one", () => {
    for (const route of ["arbitrable", null] as const) {
      expect(decisionLines(appealPeriod(route)).join(" ")).not.toMatch(/can be appealed within|Go to the arbitrable application/);
    }
  });

  it("a verified escrow's line agrees with its panel, which takes an appeal until execution, past the appeal period's end", () => {
    expect(decisionLines(appealPeriod("escrow", { verified: true, settlement: "jury-stands" }))[0]).not.toContain("while the appeal period is open");
  });

  it("says the vote was tied only for a tied vote", () => {
    for (const reason of ["no-votes", "refused"] as const) {
      expect(decisionLines(appealPeriod("crowdfunding", { jury: refused(reason) })).join(" ")).not.toMatch(/\btied\b/);
    }
    expect(decisionLines(appealPeriod("crowdfunding", { jury: refused(null) })).join(" ")).not.toMatch(/vote was tied/);
  });
});

describe("decision copy in execution", () => {
  it.each([
    ["the jury's ruling, executed", winner("jury", "executed"), ["Won by jury decision."]],
    ["the jury's ruling, not executed yet", winner("jury", "pending"), ["Won by jury decision. The ruling has not been executed yet."]],
    ["a default win, executed", winner("default", "executed"), ["Won by default: it was the only option fully funded for an appeal, so it replaced the jury's ruling, “Yes”."]],
    [
      "a default win, not executed yet",
      winner("default", "pending"),
      ["Won by default: it was the only option fully funded for an appeal, so it replaces the jury's ruling, “Yes”, when the ruling is executed."],
    ],
    ["a ruling the arbitrable reports", winner("reported", "executed"), ["The arbitrable contract reports that it executed this ruling. The jury ruled “Yes”."]],
    [
      "an unverified contract's report of the jury's own ruling",
      { ...winner("reported", "executed"), winner: YES },
      ["The arbitrable contract reports that it executed this ruling. The jury ruled “Yes”."],
    ],
  ])("words %s", (_case, decision, lines) => {
    expect(decisionLines(decision)).toEqual(lines);
  });

  it.each([
    ["none-reported", "The arbitrable contract has not reported the executed ruling."],
    ["inconsistent", "The arbitrable contract's reports of the executed ruling disagree."],
    ["out-of-range", "The arbitrable contract reported an executed ruling that is not an option of this dispute."],
    ["unread", "The arbitrable contract's record of the executed ruling could not be read."],
  ] as const)("a predicted winner whose report is %s says so after the executed line", (note, sentence) => {
    expect(decisionLines(winner("jury", "unconfirmed", { note }))).toEqual(["Won by jury decision.", sentence]);
    expect(decisionLines(winner("default", "unconfirmed", { note }))).toEqual([
      "Won by default: it was the only option fully funded for an appeal, so it replaced the jury's ruling, “Yes”.",
      sentence,
    ]);
  });

  it.each([
    ["pending", "The ruling has not been executed yet. When it is, the arbitrable contract's own rules decide the outcome."],
    ["none-reported", "The arbitrable contract did not report which ruling it executed, so the outcome is not shown."],
    ["inconsistent", "The arbitrable contract's reports of the executed ruling disagree, so the outcome is not shown."],
    ["out-of-range", "The arbitrable contract reported an executed ruling that is not an option of this dispute, so the outcome is not shown."],
    ["unread", "The ruling the arbitrable contract executed could not be read."],
  ] as const)("the jury's ruling without a winner says why when the report is %s", (execution, line) => {
    expect(decisionLines({ kind: "jury-ruling", jury: YES, execution, noun: "option" })).toEqual([line]);
  });

  it.each([
    ["tie", "The jurors' vote was tied, so the court's ruling was Refuse to Arbitrate."],
    ["no-votes", "No juror voted in the last round, so the court's ruling was Refuse to Arbitrate."],
    ["refused", "The jurors voted to refuse to arbitrate."],
    [null, "The jury refused to arbitrate or reached no majority: a tied vote, or no votes, also gave this ruling."],
  ] as const)("explains a ruling of 0 whose cause is %s in the past tense", (reason, line) => {
    const jury = refused(reason);
    expect(decisionLines({ ...winner("reported", "executed"), jury })).toEqual([
      "The arbitrable contract reports that it executed this ruling. The jury ruled “invalid / refused to arbitrate / tied”.",
      line,
    ]);
    expect(decisionLines({ kind: "jury-ruling", jury, execution: "pending", noun: "option" })[1]).toBe(line);
  });
});
