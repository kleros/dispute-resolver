import type { ChainConfig, CrowdfundingCard } from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import { useId } from "react";
import { Amount, CHIP_STATUS, FACT_LEAD, PLATE } from "../../ui";
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
 * countdown to its deadline, then the contribution and Fund. The list item is named by the card's title.
 */
export function FundingCard({ card, actions, chain }: FundingCardProps) {
  const titleId = useId();
  return (
    <li className={CARD_ITEM_CLASS} aria-labelledby={titleId}>
      <Card className={card.isWinner ? `${CARD_CLASS} ${PLATE}` : CARD_CLASS}>
        <div className="flex flex-col items-start gap-2">
          <h4 id={titleId} className={CARD_TITLE_CLASS}>
            {card.title}
          </h4>
          {card.isWinner ? <span className={CHIP_STATUS}>Latest jury decision</span> : null}
        </div>
        <div className={CARD_FOOTER_CLASS}>
          <FundingProgress percent={card.fundedPercent} deadline={card.deadline} />
          <p className="flex flex-col gap-1 text-sm text-klerosUIComponentsSecondaryText">
            <span>{"Remaining "}</span>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <Amount wei={card.remaining} chain={chain} className={FACT_LEAD} />
              <span>{" of "}</span>
              <Amount wei={card.required} chain={chain} />
            </span>
          </p>
          <FundAction subject={card.title} code={card.code} suggested={card.remaining} actions={actions} chain={chain} />
        </div>
      </Card>
    </li>
  );
}
