import type { ChainConfig, CrowdfundingCard } from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import { useId } from "react";
import { appealCardAttributes, testId } from "../../parity";
import { Amount } from "../../ui";
import { FundAction } from "./FundAction";
import { FundingProgress } from "./FundingProgress";
import { CARD_CLASS, CARD_FOOTER_CLASS, CARD_ITEM_CLASS, CARD_TITLE_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface FundingCardProps {
  readonly card: CrowdfundingCard;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
}

/**
 * One fixed crowdfunding card (spec §5.12 card contents): its title, the latest-jury-decision mark, the funding and the
 * countdown to its deadline, then the contribution and Fund. The parity hooks sit on the list item, since the library
 * `Card` does not forward `data-*` attributes (§12.1).
 */
export function FundingCard({ card, actions, chain }: FundingCardProps) {
  const titleId = useId();
  const hooks = appealCardAttributes({ code: card.code, fundedPercent: card.fundedPercent, remainingWei: card.remaining, deadline: card.deadline });
  return (
    <li className={CARD_ITEM_CLASS} aria-labelledby={titleId} {...hooks}>
      <Card className={CARD_CLASS}>
        <div className="flex flex-col items-start gap-2">
          <h4 id={titleId} className={CARD_TITLE_CLASS} {...testId("appeal-card-title")}>
            {card.title}
          </h4>
          {card.isWinner ? (
            <span className="rounded-base bg-klerosUIComponentsMediumBlue px-2 py-0.5 text-sm font-semibold text-klerosUIComponentsPrimaryBlue">Latest jury decision</span>
          ) : null}
        </div>
        <div className={CARD_FOOTER_CLASS}>
          <FundingProgress percent={card.fundedPercent} deadline={card.deadline} />
          <p className="text-sm text-klerosUIComponentsSecondaryText">
            Remaining <Amount wei={card.remaining} chain={chain} className="font-semibold text-klerosUIComponentsPrimaryText" /> of <Amount wei={card.required} chain={chain} />
          </p>
          <FundAction subject={card.title} code={card.code} suggested={card.remaining} actions={actions} chain={chain} />
        </div>
      </Card>
    </li>
  );
}
