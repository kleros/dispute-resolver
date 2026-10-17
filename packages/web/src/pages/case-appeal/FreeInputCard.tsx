import { encodeAnswer, type AnswerInput, type ChainConfig, type CrowdfundingCard, type FreeInputCard as FreeInput } from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import { useId, useState } from "react";
import { Amount, FACT_LEAD } from "../../ui";
import { AnswerField } from "./AnswerField";
import { ANSWER_ERROR_MESSAGES, fundedIntAnswer } from "./answer";
import { FundAction } from "./FundAction";
import { FundingProgress } from "./FundingProgress";
import { CARD_CLASS, CARD_FOOTER_CLASS, CARD_ITEM_CLASS, CARD_TITLE_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface FreeInputCardProps {
  readonly freeInput: FreeInput;
  /** The panel's fixed cards: an answer that already has one shows that card's funding. */
  readonly cards: readonly CrowdfundingCard[];
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
}

/**
 * The free-input card of a variable-type question (spec §5.12, D-04): the user types a new answer, core encodes it into
 * the ruling code (D-15, D-16, D-17), and the card funds it at the loser amount until the loser deadline. An answer that
 * cannot be encoded is explained (WN-3); an int answer shows which answer it funds, since -1 and -2 land on reserved
 * rulings (P-21).
 */
export function FreeInputCard({ freeInput, cards, actions, chain }: FreeInputCardProps) {
  const titleId = useId();
  const [answer, setAnswer] = useState<AnswerInput | null>(null);
  const encoding = answer === null ? null : encodeAnswer(answer, { type: freeInput.type, precision: freeInput.precision });
  const code = encoding?.ok === true ? encoding.code : null;
  const error = encoding === null || encoding.ok ? undefined : ANSWER_ERROR_MESSAGES[encoding.error];
  const funded = code === null ? undefined : cards.find((card) => card.code === code);
  return (
    <li className={CARD_ITEM_CLASS} aria-labelledby={titleId}>
      <Card className={CARD_CLASS}>
        <h4 id={titleId} className={CARD_TITLE_CLASS}>
          Fund a new answer
        </h4>
        <AnswerField type={freeInput.type} onChange={setAnswer} error={error} />
        {freeInput.type === "int" && code !== null ? (
          <p className="text-sm [overflow-wrap:anywhere]" aria-live="polite">
            This card funds the answer: <strong className="font-semibold">{fundedIntAnswer(code)}</strong>
          </p>
        ) : null}
        <div className={CARD_FOOTER_CLASS}>
          <FundingProgress percent={funded?.fundedPercent ?? 0} deadline={freeInput.deadline} />
          <p className="flex flex-col gap-1 text-sm text-klerosUIComponentsSecondaryText">
            <span>{"Required "}</span>
            <Amount wei={freeInput.required} chain={chain} className={FACT_LEAD} />
          </p>
          <FundAction subject="the new answer" code={code} suggested={freeInput.required} actions={actions} chain={chain} />
        </div>
      </Card>
    </li>
  );
}
