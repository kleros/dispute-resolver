/** The appeal panel's wording (spec §5.11, §5.12, §5.15, D-43, D-46, D-47). */
export const APPEAL_HEADING = "Appeal the decision";

/** Spec §5.11, without the withdraw sentence that today's conditional also prints in the appeal period (D-43). */
export const CROWDFUNDING_EXPLANATION =
  "In order to appeal the decision, you need to fully fund the crowdfunding deposit. The dispute will be sent to the jurors when the full deposit is reached. Note that if the previous round loser funds its side, the previous round winner should also fully fund its side in order not to lose the case.";

export const REWARDS_TITLE = "Rewards";
export const REWARDS_BODY = "Rewards only apply if both sides are funded and the option you fund wins. If no appeal takes place, your contribution is refunded.";

export const ESCROW_EXPLANATION = "In order to appeal the decision, you need to pay the appeal cost.";

/** Under the panels' write controls while no wallet is connected; they are disabled until one is. */
export const FUND_NEEDS_WALLET = "Connect a wallet to fund an appeal.";
export const APPEAL_NEEDS_WALLET = "Connect a wallet to appeal.";
export const ESCROW_ENDED = "Appeal period ended";

export const FEES_UNAVAILABLE_TITLE = "Appeal fees could not be calculated";
export const FEES_UNAVAILABLE_BODY = "The appeal funding amounts and deadlines can't be shown. Please use the arbitrable application to appeal.";

export const HANDLED_BY_ARBITRABLE_TITLE = "Appeals happen in the arbitrable application";
export const HANDLED_BY_ARBITRABLE_BODY =
  "This arbitrable contract does not take appeal funding through the Dispute Resolver. Appeals for this dispute are handled in the arbitrable application.";

export const WITHDRAW_HEADING = "Withdraw crowdfunding rewards and refunds";
export const WITHDRAW_ELIGIBLE =
  "If you have contributed to a ruling option and in the end that ruling option was the winner you are eligible for some reward. Also, if you have contributed but appeal did not happen your contribution is refunded.";
export const WITHDRAW_NOTHING =
  "You don't have any amount to withdraw. Reason might be that you did not contribute, the ruling option you have contributed did not win, you already withdrew or the ruling is not executed yet by the arbitrator.";
export const WITHDRAW_NO_ACCOUNT = "Connect a wallet to see whether you have rewards or refunds to withdraw on this dispute.";
export const WITHDRAW_UNSUPPORTED =
  "Withdrawals are not supported through the Dispute Resolver for this contract. Use the arbitrable application to withdraw your rewards and refunds.";

export const FREE_INPUT_PLACEHOLDER = "Enter a new ruling option";
