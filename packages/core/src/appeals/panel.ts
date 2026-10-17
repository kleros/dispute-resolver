import type { Outcome } from "../types";
import { computeAppealAmounts } from "./amounts";
import { buildCrowdfundingCards } from "./cards";
import { governorListIndex } from "./governor";
import { fail } from "./outcome";
import type { AppealAmounts, AppealPanel, AppealPanelInput, CrowdfundingCard, WithdrawState } from "./types";

const HIDDEN: AppealPanel = { kind: "hidden" };

/** A read the period needs, or why it is missing: a `null` read was not made, which is never shown as zero (D-36). */
function required<T>(read: Outcome<T> | null, what: string): Outcome<T> {
  return read ?? fail("not-found", `${what} was not read.`);
}

/** Escrow V1 (spec 10.2): one appeal paying the arbitrator's appeal cost, until the end of the appeal period. */
function escrowAppeal(input: AppealPanelInput): AppealPanel {
  const appealInfo = required(input.appealInfo, "The appeal cost");
  if (!appealInfo.ok) return { kind: "fees-unavailable", error: appealInfo.error };
  return { kind: "escrow-appeal", appealCost: appealInfo.value.appealCost, deadline: appealInfo.value.appealPeriodEnd };
}

/**
 * The cards a governor can fund (D-47): its `fundAppeal(listIndex)` funds list `ruling − 1`, so a card whose ruling
 * names no list (ruling 0, "refuse to arbitrate") could never be funded and is not offered.
 */
function fundsGovernorList(card: CrowdfundingCard): boolean {
  return governorListIndex(card.code) !== null;
}

/**
 * The amounts the cards are costed with. A governor whose current ruling is 0 charges every list the shared amount until
 * the end of the appeal period (P-05, `KlerosGovernor.fundAppeal`), so both sides take it; otherwise spec 5.12's sides.
 */
function cardAmounts(amounts: AppealAmounts, dialect: "idr" | "governor", currentRuling: bigint): AppealAmounts {
  if (dialect !== "governor" || currentRuling !== 0n || amounts.shared === undefined) return amounts;
  return { ...amounts, winner: amounts.shared, loser: amounts.shared };
}

/**
 * The crowdfunding cards (spec 5.11, 5.12) when the appeal cost and period, the multipliers, the round's funding and the
 * current ruling are all known; otherwise the "appeal fees could not be calculated" notice with the first missing read.
 * A governor panel drops the cards whose ruling names no list, and costs a tie with the shared multiplier (P-05).
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
  const set = buildCrowdfundingCards({
    rulingOptions: input.rulingOptions,
    fallbackOutcomes: input.fallbackOutcomes,
    currentRuling: currentRuling.value,
    amounts: cardAmounts(computeAppealAmounts(appealInfo.value, multipliers.value), dialect, currentRuling.value),
    funding: funding.value,
    override: input.override,
  });
  const cards = dialect === "governor" ? set.cards.filter(fundsGovernorList) : set.cards;
  return { kind: "crowdfunding", dialect, ...set, cards };
}

/** The execution-period withdraw panel (spec 5.11, 5.15); a state that was not read is unavailable (D-36). */
function withdraw(input: AppealPanelInput): AppealPanel {
  const state: WithdrawState = input.withdraw ?? { status: "unavailable", error: { code: "not-found", message: "The withdrawable amount was not read." } };
  return { kind: "withdraw", state };
}

/**
 * The appeal panel of a dispute (06 §1 table, spec 5.11, D-43, D-46, D-47), keyed by the family the write paths use
 * (`writeFamily`), so a registered Reality proxy is treated as the resolver family its bytecode matches and one that
 * matches none gets the note. No panel before the appeal period. In the appeal period: Escrow V1 pays the appeal cost;
 * the resolver families and governors crowdfund, governors without the ruling-0 card; view-only arbitrables show that
 * appeals happen in the arbitrable application. In execution: Escrow V1 shows the appeal period ended, idr-legacy that withdrawals are unsupported,
 * idr-v1, idr-v2 and governors the withdraw panel, view-only nothing. The withdraw state only ever appears in execution
 * (D-43).
 */
export function buildAppealPanel(input: AppealPanelInput): AppealPanel {
  const { period } = input;
  if (period !== 3 && period !== 4) return HIDDEN;
  const inAppeal = period === 3;
  switch (input.family.writeFamily) {
    case "escrow-v1":
      return inAppeal ? escrowAppeal(input) : { kind: "escrow-ended" };
    case "view-only":
      return inAppeal ? { kind: "handled-by-arbitrable" } : HIDDEN;
    case "idr-legacy":
      return inAppeal ? crowdfunding(input, "idr") : { kind: "withdraw-unsupported" };
    case "idr-v2":
    case "idr-v1":
      return inAppeal ? crowdfunding(input, "idr") : withdraw(input);
    case "governor":
      return inAppeal ? crowdfunding(input, "governor") : withdraw(input);
  }
}
