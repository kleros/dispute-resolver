import type { Decision, ExecutionNote, JuryRuling, RulingNoun } from "@dispute-resolver/core";

type ShownDecision = Exclude<Decision, { readonly kind: "none" }>;
type AppealDecision = Extract<Decision, { readonly kind: "jury-decision" }>;
type Winner = Extract<Decision, { readonly kind: "winner" }>;

const PLURAL: Readonly<Record<RulingNoun, string>> = { option: "options", answer: "answers", list: "lists" };

/** Why the court's ruling is 0, in the appeal period's present tense or execution's past tense; nothing for any other ruling. */
function zeroRulingLine(jury: JuryRuling, tense: "present" | "past"): string | null {
  if (jury.ruling !== 0n) return null;
  const is = tense === "present" ? "is" : "was";
  switch (jury.zeroReason) {
    case "tie":
      return `The jurors' vote was tied, so the court's ruling ${is} Refuse to Arbitrate.`;
    case "no-votes":
      return tense === "present"
        ? "No juror voted in this round, so the court's ruling is Refuse to Arbitrate."
        : "No juror voted in the last round, so the court's ruling was Refuse to Arbitrate.";
    case "refused":
      return "The jurors voted to refuse to arbitrate.";
    case null:
      return `The jury refused to arbitrate or reached no majority: a tied vote, or no votes, also ${tense === "present" ? "gives" : "gave"} this ruling.`;
  }
}

/** The court takes an appeal only from the arbitrable itself, so a contract without an appeal call has none. */
const APPEAL_DEPENDS_ON_CONTRACT = "Whether and how this decision can be appealed depends on the arbitrable contract.";
const ARBITRABLE_APPEALS = `${APPEAL_DEPENDS_ON_CONTRACT} If it can, it is done in the arbitrable application.`;

/**
 * How the ruling can be appealed. A contract's own rule is stated only when the registry verified its code, and an
 * appeal is promised only where the registry or the contract's probed functions show one.
 */
function appealLine({ route, verified, settlement, noun }: AppealDecision): string {
  const nouns = PLURAL[noun];
  switch (route) {
    case "crowdfunding":
      if (verified && settlement === "sole-funded-wins") {
        return `This ruling can still change. If only one ${noun} is fully funded before its funding closes, that ${noun} wins, whatever the jury ruled. If two ${nouns} are fully funded, the case goes to new jurors.`;
      }
      if (verified && settlement === "jury-stands") {
        return `This ruling changes only if two ${nouns} are fully funded before their funding closes: the case then goes to new jurors. If only one ${noun} is fully funded, the jury's ruling stands.`;
      }
      return `This ruling can be appealed by funding it below. The Dispute Resolver has not verified this contract's rules, so what happens if only one ${noun} is fully funded depends on the contract.`;
    case "escrow":
      return verified
        ? "This ruling can be appealed here by paying the appeal cost until the dispute moves to execution; new jurors then decide."
        : "This ruling can be appealed here by paying the appeal cost while the appeal period is open. The Dispute Resolver has not verified this contract's rules.";
    case "arbitrable":
      return ARBITRABLE_APPEALS;
    case "unsupported":
      return "This decision can be appealed within the appeal period, but the Dispute Resolver cannot fund appeals on this contract.";
    case "none":
      return "This arbitrable contract has no appeal: the ruling becomes final when the appeal period ends.";
    case null:
      return APPEAL_DEPENDS_ON_CONTRACT;
  }
}

const NOTE: Readonly<Record<ExecutionNote, string>> = {
  "none-reported": "The arbitrable contract has not reported the executed ruling.",
  inconsistent: "The arbitrable contract's reports of the executed ruling disagree.",
  "out-of-range": "The arbitrable contract reported an executed ruling that is not an option of this dispute.",
  unread: "The arbitrable contract's record of the executed ruling could not be read.",
};

const NO_OUTCOME: Readonly<Record<Extract<Decision, { readonly kind: "jury-ruling" }>["execution"], string>> = {
  pending: "The ruling has not been executed yet. When it is, the arbitrable contract's own rules decide the outcome.",
  "none-reported": "The arbitrable contract did not report which ruling it executed, so the outcome is not shown.",
  inconsistent: "The arbitrable contract's reports of the executed ruling disagree, so the outcome is not shown.",
  "out-of-range": "The arbitrable contract reported an executed ruling that is not an option of this dispute, so the outcome is not shown.",
  unread: "The ruling the arbitrable contract executed could not be read.",
};

function winnerLines({ wonBy, execution, note, noun, jury }: Winner): string[] {
  const juryRuled = `“${jury.rulingText}”`;
  if (wonBy === "reported") return [`The arbitrable contract reports that it executed this ruling. The jury ruled ${juryRuled}.`];
  const pending = execution === "pending";
  let first = pending ? "Won by jury decision. The ruling has not been executed yet." : "Won by jury decision.";
  if (wonBy === "default") {
    first = pending
      ? `Won by default: it was the only ${noun} fully funded for an appeal, so it replaces the jury's ruling, ${juryRuled}, when the ruling is executed.`
      : `Won by default: it was the only ${noun} fully funded for an appeal, so it replaced the jury's ruling, ${juryRuled}.`;
  }
  return note === null ? [first] : [first, NOTE[note]];
}

/** The decision's explanation, one sentence group per line, in reading order. */
export function decisionLines(decision: ShownDecision): string[] {
  switch (decision.kind) {
    case "jury-decision":
      return [zeroRulingLine(decision.jury, "present"), appealLine(decision)].filter((line) => line !== null);
    case "winner":
      return [...winnerLines(decision), zeroRulingLine(decision.jury, "past")].filter((line) => line !== null);
    case "jury-ruling":
      return [NO_OUTCOME[decision.execution], zeroRulingLine(decision.jury, "past")].filter((line) => line !== null);
  }
}

/** Whether the arbitrable's report of the executed ruling failed to load, so reading it again can change the text. */
export function executionUnread(decision: ShownDecision): boolean {
  if (decision.kind === "winner") return decision.note === "unread";
  return decision.kind === "jury-ruling" && decision.execution === "unread";
}
