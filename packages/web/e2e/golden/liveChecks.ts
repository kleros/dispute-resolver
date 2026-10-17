import type { CheckResult } from "./compare/engine";
import { sameJson } from "./compare/values";
import { expectedTimeline } from "./ledger";
import type { AppealCardSnapshot, CaseSnapshot } from "./types";

// The period-dependent checks of docs/parity/04-golden-cases.md §3, on the new app's snapshot of a live-tier pick. They
// follow the period the new app shows; the pick's own period is a note, since the dispute may have moved on since
// `golden/live.json` was written.

/** The submit-evidence control of the Evidence panel (spec 5.14): its button's accessible name and whether it is disabled. */
export interface SubmitControlState {
  readonly label: string | null;
  readonly disabled: boolean | null;
}

/** The enabled control of a compatible arbitrable (`pages/case-evidence/EvidenceSection.tsx`). */
export const SUBMIT_EVIDENCE_LABEL = "Submit New Evidence";
/** The disabled control of a view-only arbitrable. */
export const VIEW_ONLY_SUBMIT_LABEL = "Go to Arbitrable Application to Submit Evidence";

const COMMIT_PERIOD = 1;
const APPEAL_PERIOD = 3;

function check(name: string, expected: unknown, actual: unknown, blocking = true): CheckResult {
  return { name, ok: sameJson(expected, actual), blocking, expected, actual };
}

/** D-39 in a live pick: Commit is required in the commit period; outside it the court is not recorded, so either form is the period's. */
function timelineCheck(period: number, next: CaseSnapshot): CheckResult {
  const withCommit = period === COMMIT_PERIOD || (next.timeline?.some((column) => column.name === "commit") ?? false);
  return check("04 §3, D-39: the timeline's columns and states follow the period", expectedTimeline(period, withCommit), next.timeline);
}

function expectedSubmitControl(period: number, compatibility: CaseSnapshot["compatibility"]): SubmitControlState {
  if (period > APPEAL_PERIOD) return { label: null, disabled: null };
  return compatibility === "full" ? { label: SUBMIT_EVIDENCE_LABEL, disabled: false } : { label: VIEW_ONLY_SUBMIT_LABEL, disabled: true };
}

function hasFunding(card: AppealCardSnapshot): boolean {
  return card.fundedPercent !== null && card.remainingWei !== null && card.deadline !== null;
}

/**
 * The appeal-period checks: every card with a ruling code shows its funding, remaining amount and deadline, and the
 * current ruling's card (the winner, matched by its title) closes no earlier than any other. Without a winner card (a
 * tie, or a ruling no card shows) every card is a loser, which is reported as a note.
 */
function appealChecks(next: CaseSnapshot): CheckResult[] {
  const cards = next.appealPanel.cards.filter((card) => card.code !== null);
  const funding = check(
    "04 §3: every crowdfunding card shows its funded percentage, remaining amount and deadline",
    [],
    cards.filter((card) => !hasFunding(card)).map((card) => card.title),
  );
  const rulingText = next.decision?.rulingText ?? null;
  const winner = cards.find((card) => card.title === rulingText);
  if (winner === undefined || winner.deadline === null) {
    return [funding, check("04 §3: a card is the current ruling's, the winner", rulingText, winner?.title ?? null, false)];
  }
  const winnerDeadline = winner.deadline;
  const later = cards.filter((card) => card !== winner && card.deadline !== null && card.deadline > winnerDeadline).map((card) => card.title);
  return [funding, check("04 §3: the winner's deadline is not earlier than any loser's", [], later)];
}

/** The 04 §3 checks of a live pick picked in `pickedPeriod` at `block`, on the new app's snapshot and its submit control. */
export function checkLivePeriod(pickedPeriod: number, block: number, next: CaseSnapshot, submit: SubmitControlState): CheckResult[] {
  const stillInPeriod = check(`04 §3: the dispute is still in the period it was picked in at block ${block.toString()}`, pickedPeriod, next.period, false);
  const { period } = next;
  if (period === null) return [stillInPeriod, check("04 §3: the new app shows the dispute's period", true, false)];
  const checks = [
    stillInPeriod,
    timelineCheck(period, next),
    check("04 §3: the submit-evidence control for the period and the arbitrable's compatibility", expectedSubmitControl(period, next.compatibility), submit),
    check("04 §3: the appeal panel exists only in periods 3 and 4", period >= APPEAL_PERIOD, next.appealPanel.kind !== "hidden"),
  ];
  return period === APPEAL_PERIOD ? [...checks, ...appealChecks(next)] : checks;
}
