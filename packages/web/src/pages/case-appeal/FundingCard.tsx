import type { ChainConfig, CrowdfundingCard } from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import { useId } from "react";
import { CHIP_STATUS, PLATE } from "../../ui";
import { EnteredAnswerFooter } from "./FreeInputCard";
import { CARD_CLASS, CARD_FOOTER_CLASS, CARD_ITEM_CLASS, CARD_TITLE_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface FundingCardProps {
  readonly card: CrowdfundingCard;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
  readonly isFundDisabled: boolean;
  /** Whether the registry verified the contract's rules, which words the card's deadline. */
  readonly verified: boolean;
}

export function FundingCard({ card, actions, chain, isFundDisabled, verified }: FundingCardProps) {
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
          <EnteredAnswerFooter funding={card} subject={card.title} code={card.code} actions={actions} chain={chain} isFundDisabled={isFundDisabled} verified={verified} />
        </div>
      </Card>
    </li>
  );
}
