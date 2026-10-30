import type { AppealRules, RulingNoun } from "../families/types";
import type { MetaEvidenceResult } from "../metaEvidence/types";
import { fail, succeed } from "../outcome";
import { formatRuling } from "../rulings";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";
import type { Outcome } from "../types";
import type { ArbitratorDispute, Decision, DisputeReads, ExecutedRuling, JuryDecisionNote, RulingFact } from "./types";

const DETAILS_NOT_READ = "The dispute details were not read.";

function rulingSources(metaEvidence: MetaEvidenceResult | null): { readonly rulingOptions: RulingOptions | null; readonly fallbackOutcomes: FallbackOutcomes } {
  if (metaEvidence?.status === "ok" || metaEvidence?.status === "invalid") {
    return { rulingOptions: metaEvidence.metaEvidence.rulingOptions, fallbackOutcomes: metaEvidence.metaEvidence.fallbackOutcomes };
  }
  return { rulingOptions: null, fallbackOutcomes: null };
}

function appealNote(rules: AppealRules | null): JuryDecisionNote {
  if (rules === null || rules.route === "arbitrable") return "appealable-in-arbitrable";
  return rules.route === "none" ? "not-appealable" : "appealable";
}

/** The only ruling the last round's funding shows fully funded, when it is one of the dispute's options. */
function soleFunded(funded: Outcome<readonly bigint[]> | null, dispute: ArbitratorDispute): bigint | undefined {
  if (funded?.ok !== true) return undefined;
  const rulings = new Set(funded.value);
  const [only] = rulings;
  return rulings.size === 1 && only !== undefined && only <= dispute.numberOfChoices ? only : undefined;
}

interface Execution {
  readonly dispute: ArbitratorDispute;
  readonly court: bigint;
  readonly executed: ExecutedRuling | null;
  readonly funded: Outcome<readonly bigint[]> | null;
  readonly fact: (ruling: bigint) => RulingFact;
  readonly noun: RulingNoun;
}

/**
 * The applied ruling is the arbitrable's own report: it wins by default only when the funding shows it alone fully
 * funded. Without a report, that funding alone names the winner, and otherwise the court's ruling stands.
 */
function inExecution({ dispute, court, executed, funded, fact, noun }: Execution): Decision {
  if (!dispute.ruled) return { kind: "jury-decision", court: fact(court), note: "not-executed" };
  if (executed?.status === "out-of-range" || executed?.status === "inconsistent") return { kind: "jury-decision", court: fact(court), note: executed.status };
  const won = (ruling: bigint, wonBy: "jury" | "default" | "applied"): Decision => ({ kind: "winner", winner: fact(ruling), court: fact(court), wonBy, noun });
  const byDefault = soleFunded(funded, dispute);
  if (executed?.status === "executed") {
    if (executed.ruling === court) return won(court, "jury");
    return won(executed.ruling, byDefault === executed.ruling ? "default" : "applied");
  }
  return byDefault === undefined || byDefault === court ? won(court, "jury") : won(byDefault, "default");
}

/** The decision section of a dispute; a missing read degrades this section only. */
export function buildDecision(input: {
  readonly dispute: ArbitratorDispute;
  readonly reads: DisputeReads | null;
  /** `null` when the family is unknown. */
  readonly rules: AppealRules | null;
  readonly executed: ExecutedRuling | null;
  /** The last round's fully funded rulings; `null` when they are not read. */
  readonly fundedRulings: Outcome<readonly bigint[]> | null;
  readonly metaEvidence: MetaEvidenceResult | null;
}): Outcome<Decision> {
  const { dispute, reads, rules } = input;
  if (dispute.period < 3) return succeed({ kind: "none" });
  if (reads === null) return fail("rpc-error", DETAILS_NOT_READ);
  if (!reads.currentRuling.ok) return reads.currentRuling;
  const { rulingOptions, fallbackOutcomes } = rulingSources(input.metaEvidence);
  const fact = (ruling: bigint): RulingFact => ({ ruling, rulingText: formatRuling(ruling, rulingOptions, fallbackOutcomes) });
  const court = reads.currentRuling.value;
  if (dispute.period === 3) return succeed({ kind: "jury-decision", court: fact(court), note: appealNote(rules) });
  return succeed(inExecution({ dispute, court, executed: input.executed, funded: input.fundedRulings, fact, noun: rules?.noun ?? "option" }));
}

/**
 * Whether the execution-period decision depends on the last round's funding: the arbitrator executed the ruling, and the
 * arbitrable applied another ruling than the court's or its report is missing.
 */
export function decisionNeedsFunding(dispute: ArbitratorDispute, executed: ExecutedRuling, court: bigint): boolean {
  if (dispute.period !== 4 || !dispute.ruled) return false;
  if (executed.status === "executed") return executed.ruling !== court;
  return executed.status === "none-reported" || executed.status === "unread";
}
