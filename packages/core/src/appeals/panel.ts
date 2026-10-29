import type { FamilyDetection } from "../families/types";
import type { Outcome, Period } from "../types";
import { computeAppealAmounts } from "./amounts";
import { buildCrowdfundingCards } from "./cards";
import { governorListIndex } from "./governor";
import { fail } from "../outcome";
import type { AppealAmounts, AppealPanel, AppealPanelInput, WithdrawState } from "./types";

const HIDDEN: AppealPanel = { kind: "hidden" };

/** A read the period needs, or why it is missing: a `null` read was not made, which is never shown as zero. */
function required<T>(read: Outcome<T> | null, what: string): Outcome<T> {
  return read ?? fail("not-found", `${what} was not read.`);
}

/** Escrow V1: one appeal paying the arbitrator's appeal cost, until the end of the appeal period. */
function escrowAppeal(input: AppealPanelInput): AppealPanel {
  const appealInfo = required(input.appealInfo, "The appeal cost");
  if (!appealInfo.ok) return { kind: "fees-unavailable", error: appealInfo.error };
  return { kind: "escrow-appeal", appealCost: appealInfo.value.appealCost, deadline: appealInfo.value.appealPeriodEnd };
}

/**
 * A governor whose current ruling is 0 charges every list the shared amount until the end of the appeal period
 * (`KlerosGovernor.fundAppeal`), so both sides take it.
 */
function cardAmounts(amounts: AppealAmounts, dialect: "idr" | "governor", currentRuling: bigint): AppealAmounts {
  if (dialect !== "governor" || currentRuling !== 0n || amounts.shared === undefined) return amounts;
  return { ...amounts, winner: amounts.shared, loser: amounts.shared };
}

const NO_SHARED_MULTIPLIER = "The governor's shared multiplier could not be read, so the deposits for a tied ruling are unknown.";

/**
 * The crowdfunding cards when the appeal cost and period, the multipliers, the round's funding and the current ruling
 * are all known; otherwise the "appeal fees could not be calculated" notice with the first missing read. A governor tie
 * without its shared multiplier is that notice too: KlerosGovernor never costs a tie as a winner and a loser.
 */
function crowdfunding(input: AppealPanelInput, dialect: "idr" | "governor"): AppealPanel {
  const appealInfo = required(input.appealInfo, "The appeal cost and period");
  if (!appealInfo.ok) return { kind: "fees-unavailable", error: appealInfo.error };
  const multipliers = required(input.multipliers, "The appeal multipliers");
  if (!multipliers.ok) return { kind: "fees-unavailable", error: multipliers.error };
  const funding = required(input.funding, "The appeal funding");
  if (!funding.ok) return { kind: "fees-unavailable", error: funding.error };
  const { currentRuling } = input;
  if (!currentRuling.ok) return { kind: "fees-unavailable", error: currentRuling.error };
  const amounts = computeAppealAmounts(appealInfo.value, multipliers.value);
  const tie = currentRuling.value === 0n ? input.rules.tie : null;
  if (dialect === "governor" && tie !== null && amounts.shared === undefined) return { kind: "fees-unavailable", error: { code: "unsupported", message: NO_SHARED_MULTIPLIER } };
  const set = buildCrowdfundingCards({
    rulingOptions: input.rulingOptions,
    fallbackOutcomes: input.fallbackOutcomes,
    currentRuling: currentRuling.value,
    amounts: cardAmounts(amounts, dialect, currentRuling.value),
    funding: funding.value,
    override: input.override,
    tie,
  });
  // A governor's `fundAppeal(listIndex)` funds list `ruling − 1`: ruling 0 names no list, so it could never be funded.
  const cards = dialect === "governor" ? set.cards.filter((card) => governorListIndex(card.code) !== null) : set.cards;
  const terms = { noun: input.rules.noun, tie, appealPeriodEnd: appealInfo.value.appealPeriodEnd, loserDeadline: amounts.loser.deadline };
  return { kind: "crowdfunding", dialect, ...set, cards, terms };
}

/** The execution-period withdraw panel; a state that was not read is unavailable, never empty. */
function withdraw(input: AppealPanelInput): AppealPanel {
  const state: WithdrawState = input.withdraw ?? { status: "unavailable", error: { code: "not-found", message: "The withdrawable amount was not read." } };
  return { kind: "withdraw", state };
}

/**
 * Whether a dispute has an appeal panel at all. It needs only the period and the family, which are known before the
 * panel's other reads, so the case page can lay out its sections once instead of dropping one after the reads settle.
 */
export function hasAppealPanel(period: Period, family: Pick<FamilyDetection, "writeFamily">): boolean {
  if (period === 3) return true;
  return period === 4 && family.writeFamily !== "view-only";
}

/**
 * Whether the appeal panel reads the ruling options: only the crowdfunding cards do. Every other panel (Escrow V1's
 * appeal, withdrawals, the arbitrable's own appeals, the ended notices) is built without them, so a dispute whose
 * meta-evidence is missing or failed still gets it.
 */
export function needsRulingOptions(period: Period, family: Pick<FamilyDetection, "writeFamily">): boolean {
  if (period !== 3) return false;
  switch (family.writeFamily) {
    case "idr-v1":
    case "idr-v2":
    case "governor":
      return true;
    case "idr-legacy":
    case "escrow-v1":
    case "view-only":
      return false;
  }
}

/** The appeal-period panel, by the route the appeal rules give. */
function appealPeriodPanel(input: AppealPanelInput): AppealPanel {
  switch (input.rules.route) {
    case "none":
      return { kind: "not-appealable" };
    case "unsupported":
      return { kind: "funding-unsupported" };
    case "escrow":
      return escrowAppeal(input);
    case "arbitrable":
      return { kind: "handled-by-arbitrable" };
    case "crowdfunding":
      return crowdfunding(input, input.family.writeFamily === "governor" ? "governor" : "idr");
  }
}

/**
 * The appeal panel of a dispute. No panel before the appeal period. In the appeal period, by the route of the appeal
 * rules: Escrow V1 pays the appeal cost; the resolver families, registered Reality proxies and governors crowdfund; an
 * arbitrable without an appeal function says it cannot be appealed, one whose funding is not supported says so, and
 * view-only arbitrables show that appeals happen in the arbitrable application. In execution, by the write family:
 * Escrow V1 shows the appeal period ended, idr-legacy that withdrawals are unsupported, idr-v1, idr-v2 and governors the
 * withdraw panel, view-only nothing.
 */
export function buildAppealPanel(input: AppealPanelInput): AppealPanel {
  const { period } = input;
  if (!hasAppealPanel(period, input.family)) return HIDDEN;
  if (period === 3) return appealPeriodPanel(input);
  switch (input.family.writeFamily) {
    case "escrow-v1":
      return { kind: "escrow-ended" };
    case "view-only":
      return HIDDEN;
    case "idr-legacy":
      return { kind: "withdraw-unsupported" };
    case "idr-v2":
    case "idr-v1":
    case "governor":
      return withdraw(input);
  }
}
