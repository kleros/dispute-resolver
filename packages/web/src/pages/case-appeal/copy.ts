import type { FundingTerms, RulingNoun, TieDialect } from "@dispute-resolver/core";
import { utcText } from "../../ui";

export const APPEAL_HEADING = "Appeal the decision";

const PLURAL: Readonly<Record<RulingNoun, string>> = { option: "options", answer: "answers", list: "lists" };

/** How to appeal, and what a lone fully funded ruling does on this contract when the registry verified its code. */
export function crowdfundingExplanation({ verified, settlement, noun }: Pick<FundingTerms, "verified" | "settlement" | "noun">): string {
  const fund = `To appeal, fully fund the deposit of the ${noun} you support. When two ${PLURAL[noun]} are fully funded, the case goes to new jurors.`;
  if (verified && settlement === "sole-funded-wins") return `${fund} If only one ${noun} is fully funded when funding closes, it wins, even against the jury's ruling.`;
  if (verified && settlement === "jury-stands") return `${fund} If only one ${noun} is fully funded when funding closes, there is no appeal and the jury's ruling stands.`;
  return `To appeal, fund the deposit of the ${noun} you support.`;
}

/** Why the cards close at different times, from the live multipliers; once above the cards rather than on each one. */
export function fundingBasis({ noun, loserWindowPercent, loserDeadline, appealPeriodEnd }: FundingTerms): string {
  if (loserDeadline >= appealPeriodEnd) return `Every ${noun} can be funded until the appeal period ends.`;
  return `The current ruling can be funded until the appeal period ends. Other ${PLURAL[noun]} can be funded during the first ${String(loserWindowPercent)}% of the appeal period.`;
}

/** One fully funded ruling so far, on a contract where a lone fully funded ruling wins; no time is named, since each card has its own. */
export function soleFundedLine(title: string, noun: RulingNoun): string {
  return `“${title}” is the only fully funded ${noun} so far. It wins unless another ${noun} is fully funded before its funding closes.`;
}

export const UNVERIFIED_TITLE = "Appeal rules not verified";
export const UNVERIFIED_BODY =
  "The Dispute Resolver has not verified this contract's appeal rules: the amounts and deadlines below are the ones the Dispute Resolver applies, which the contract may not follow. Nothing is sent if the contract would reject your contribution.";

const TIE_TITLES: Readonly<Record<TieDialect, string>> = {
  "refuse-is-winner": "Refuse to Arbitrate is the current ruling",
  "shared-full-period": "No list won this round",
  "all-winner": "Refuse to Arbitrate cannot be funded",
};

export function tieTitle(tie: TieDialect): string {
  return TIE_TITLES[tie];
}

export function tieBody(tie: TieDialect, { noun, appealPeriodEnd, loserDeadline }: FundingTerms): string {
  const end = utcText(appealPeriodEnd);
  switch (tie) {
    case "refuse-is-winner":
      return `Refuse to Arbitrate counts as the winning ${noun}: its funding closes at ${end}. Funding for every other ${noun} closes at ${utcText(loserDeadline)}.`;
    case "shared-full-period":
      return `Every list can be funded with the same deposit; funding closes at ${end} for all of them. If only one list is fully funded, it wins.`;
    case "all-winner":
      return `Refuse to Arbitrate cannot be funded on this contract. Every ${noun} can be funded with the same deposit; funding closes at ${end} for all of them.`;
  }
}

export const REWARDS_TITLE = "Rewards";
/** `null` for a contract whose rules were not verified: how it pays rewards is unknown. A refund is promised only where its withdraw code was read. */
export function rewardsBody({ verified, settlement, refundsWithoutAppeal, noun }: Pick<FundingTerms, "verified" | "settlement" | "refundsWithoutAppeal" | "noun">): string | null {
  const both = `Rewards only apply if both sides are funded and the ${noun} you fund wins.`;
  if (!verified) return null;
  if (settlement === "sole-funded-wins") return refundsWithoutAppeal ? `${both} If no appeal takes place, your contribution is refunded.` : both;
  if (settlement === "jury-stands") return `${both} On this contract, if only one ${noun} is fully funded and it is not the jury's ruling, contributions to it are not returned.`;
  return null;
}

/** A verified contract's deadline is its own; any other contract's is only the one the Dispute Resolver stops funding at. */
export const FUNDING_CLOSES = "Funding closes ";
export const DEADLINE_USED_HERE = "Deadline used here ";
export const FUNDING_CLOSED = "Closed";
export const FUNDING_CLOSED_AT = "Closed at ";
export const FUNDING_CLOSED_HERE = "Closed here";
export const FUNDING_STOPPED_HERE_AT = "Dispute Resolver stopped funding at ";

export const ESCROW_EXPLANATION = "In order to appeal the decision, you need to pay the appeal cost.";
export const ESCROW_ENDS = "The appeal period ends ";
export const ESCROW_ENDED_AT = "The appeal period ended ";
export const ESCROW_STILL_ACCEPTED = "Until the dispute moves to execution, an appeal is still accepted.";
export const ESCROW_CONTRACT_DECIDES = "The contract decides whether it still accepts an appeal.";

export const FUND_NEEDS_WALLET = "Connect a wallet to fund an appeal.";
export const APPEAL_NEEDS_WALLET = "Connect a wallet to appeal.";
export const ESCROW_ENDED = "Appeal period ended";

export const FEES_UNAVAILABLE_TITLE = "Appeal fees could not be calculated";
export const FEES_UNAVAILABLE_BODY = "The appeal funding amounts and deadlines can't be shown. Please use the arbitrable application to appeal.";

export const NOT_APPEALABLE_TITLE = "This dispute cannot be appealed";
export const NOT_APPEALABLE_BODY = "This arbitrable contract has no way to appeal, so the jury's ruling becomes final when the appeal period ends.";

export const FUNDING_UNSUPPORTED_TITLE = "Appeal funding unavailable here";
export const FUNDING_UNSUPPORTED_BODY =
  "The Dispute Resolver cannot fund appeals on this arbitrable contract: its funding rules differ from the ones the Dispute Resolver supports. If this dispute can be appealed, it is funded through the arbitrable's own application or interface.";

export const HANDLED_BY_ARBITRABLE_TITLE = "Appeals happen in the arbitrable application";
export const HANDLED_BY_ARBITRABLE_BODY =
  "This arbitrable contract does not take appeal funding through the Dispute Resolver. Whether and how this decision can be appealed depends on the arbitrable contract. If it can, it is done in the arbitrable application.";

export const WITHDRAW_HEADING = "Withdraw crowdfunding rewards and refunds";
export const WITHDRAW_ELIGIBLE =
  "What a contribution earns or gets back is set by the arbitrable contract's own rules. Any amount it owes you for this dispute can be withdrawn here.";
export const WITHDRAW_NOTHING =
  "You don't have any amount to withdraw. Reason might be that you did not contribute, the ruling option you have contributed did not win, you already withdrew or the ruling is not executed yet by the arbitrator.";
export const WITHDRAW_NO_ACCOUNT = "Connect a wallet to see whether you have rewards or refunds to withdraw on this dispute.";
export const WITHDRAW_UNSUPPORTED =
  "Withdrawals are not supported through the Dispute Resolver for this contract. Use the arbitrable application to withdraw your rewards and refunds.";

export const FREE_INPUT_PLACEHOLDER = "Enter a new ruling option";

export function matchedCardLine(title: string): string {
  return `This answer has its own card, “${title}”: its funding is shown here.`;
}

/** What an entry with no card of its own funds, for screen readers: the entered card's numbers are the new answer's. */
export function newAnswerLine(kind: "answer" | "combination"): string {
  return `This ${kind} has no card of its own: it is funded as a new ${kind}.`;
}

export const APPEAL_COST_CHECKING = "Checking the appeal cost…";

export const APPEAL_COST_CHANGED_TITLE = "The appeal cost changed";
export function appealCostChangedBody(amount: string): string {
  return `The appeal now costs ${amount}. Press Appeal again to pay it. Nothing was sent.`;
}

export const APPEAL_COST_UNREAD_TITLE = "Appeal cost unavailable";
export function appealCostUnreadBody(reason: string): string {
  return `The appeal cost could not be read again, so nothing was sent. ${reason}`;
}
