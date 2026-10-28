import type { AppealRules, RulingNoun } from "../families/types";
import type { MetaEvidenceResult } from "../metaEvidence/types";
import { fail, succeed } from "../outcome";
import { formatRuling } from "../rulings";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";
import type { Outcome } from "../types";
import type { ArbitratorDispute, Decision, DisputeReads, ExecutedRuling, ExecutionNote, JuryRuling } from "./types";
import { zeroRulingReason } from "./voteCounter";

const DETAILS_NOT_READ = "The dispute details were not read.";
const EXECUTION_NOT_READ = "The ruling the arbitrable executed was not read.";

function rulingSources(metaEvidence: MetaEvidenceResult | null): { readonly rulingOptions: RulingOptions | null; readonly fallbackOutcomes: FallbackOutcomes } {
  if (metaEvidence?.status === "ok" || metaEvidence?.status === "invalid") {
    return { rulingOptions: metaEvidence.metaEvidence.rulingOptions, fallbackOutcomes: metaEvidence.metaEvidence.fallbackOutcomes };
  }
  return { rulingOptions: null, fallbackOutcomes: null };
}

interface DecisionContext {
  readonly jury: JuryRuling;
  readonly rules: AppealRules | null;
  readonly noun: RulingNoun;
  readonly text: (ruling: bigint) => string;
}

function juryRuling(reads: DisputeReads, ruling: bigint, text: (ruling: bigint) => string): JuryRuling {
  const counter = reads.lastRoundVotes;
  const zeroReason = ruling === 0n && counter?.ok === true ? zeroRulingReason(counter.value) : null;
  return { ruling, rulingText: text(ruling), zeroReason };
}

/**
 * The winner a verified contract's rules give without its report, or `null` when they cannot: an unverified contract,
 * or a sole-funded-wins contract whose last round's funding was not read.
 */
function predictedWinner(
  rules: AppealRules | null,
  jury: bigint,
  fundedRulings: Outcome<readonly bigint[]> | null,
): { readonly ruling: bigint; readonly wonBy: "jury" | "default" } | null {
  if (rules?.verified !== true) return null;
  if (rules.route === "none" || rules.settlement === "jury-stands") return { ruling: jury, wonBy: "jury" };
  if (rules.settlement !== "sole-funded-wins" || fundedRulings?.ok !== true) return null;
  const [only, ...others] = fundedRulings.value;
  return only !== undefined && others.length === 0 && only !== jury ? { ruling: only, wonBy: "default" } : { ruling: jury, wonBy: "jury" };
}

function inExecution(context: DecisionContext, dispute: ArbitratorDispute, executed: ExecutedRuling, fundedRulings: Outcome<readonly bigint[]> | null): Decision {
  const { jury, rules, noun, text } = context;
  const verified = rules?.verified === true;
  if (dispute.ruled && executed.status === "executed") {
    const { ruling } = executed;
    // Any contract can emit a Ruling event equal to the jury's, at any time: only verified code makes it the jury's win.
    let wonBy: "jury" | "default" | "reported" = "reported";
    if (verified && ruling === jury.ruling) wonBy = "jury";
    else if (verified && rules.settlement === "sole-funded-wins") wonBy = "default";
    return { kind: "winner", winner: { ruling, rulingText: text(ruling) }, jury, wonBy, verified, execution: "executed", note: null, noun };
  }
  let note: ExecutionNote | null = null;
  if (dispute.ruled) note = executed.status === "executed" || executed.status === "not-executed" ? "unread" : executed.status;
  const predicted = predictedWinner(rules, jury.ruling, fundedRulings);
  if (predicted === null) return { kind: "jury-ruling", jury, execution: note ?? "pending", noun };
  const winner = { ruling: predicted.ruling, rulingText: text(predicted.ruling) };
  return { kind: "winner", winner, jury, wonBy: predicted.wonBy, verified, execution: note === null ? "pending" : "unconfirmed", note, noun };
}

/**
 * The decision section of a dispute. In execution the arbitrable's reported executed ruling names the winner once the
 * arbitrator has executed it; before that, or when the report is missing, a verified contract's rules predict it from
 * the last round's funding, and any other contract shows the jury's ruling. A missing read degrades this section only.
 */
export function buildDecision(input: {
  readonly dispute: ArbitratorDispute;
  readonly reads: DisputeReads | null;
  /** `null` when the family is unknown. */
  readonly rules: AppealRules | null;
  /** Execution period: `readExecutedRuling`'s result. */
  readonly executed: ExecutedRuling | null;
  /** The last round's fully funded rulings; `null` when the family's funding is not read. */
  readonly fundedRulings: Outcome<readonly bigint[]> | null;
  readonly metaEvidence: MetaEvidenceResult | null;
}): Outcome<Decision> {
  const { dispute, reads, rules } = input;
  if (dispute.period < 3) return succeed({ kind: "none" });
  if (reads === null) return fail("rpc-error", DETAILS_NOT_READ);
  if (!reads.currentRuling.ok) return reads.currentRuling;
  const { rulingOptions, fallbackOutcomes } = rulingSources(input.metaEvidence);
  const text = (ruling: bigint): string => formatRuling(ruling, rulingOptions, fallbackOutcomes);
  const jury = juryRuling(reads, reads.currentRuling.value, text);
  const noun = rules?.noun ?? "option";
  if (dispute.period === 3) {
    return succeed({ kind: "jury-decision", jury, route: rules?.route ?? null, verified: rules?.verified ?? false, settlement: rules?.settlement ?? "unknown", noun });
  }
  if (input.executed === null) {
    if (dispute.ruled) return fail("not-found", EXECUTION_NOT_READ);
    return succeed(inExecution({ jury, rules, noun, text }, dispute, { status: "not-executed" }, input.fundedRulings));
  }
  return succeed(inExecution({ jury, rules, noun, text }, dispute, input.executed, input.fundedRulings));
}
