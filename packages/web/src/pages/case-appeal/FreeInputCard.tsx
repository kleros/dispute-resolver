import {
  cardFundingState,
  encodeAnswer,
  enteredAnswerFunding,
  type AnswerInput,
  type ChainConfig,
  type CrowdfundingCard,
  type EnteredAnswerFunding,
  type FreeInputCard as FreeInput,
} from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import { useId, useState } from "react";
import { Amount, FACT_LEAD, formatAmount, useNowSeconds } from "../../ui";
import { AnswerField } from "./AnswerField";
import { ANSWER_ERROR_MESSAGES, fundedIntAnswer } from "./answer";
import { matchedCardLine, newAnswerLine } from "./copy";
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
  readonly isFundDisabled: boolean;
  /** Whether the registry verified the contract's rules, which words the card's deadline. */
  readonly verified: boolean;
}

const NOTE_CLASS = "text-sm [overflow-wrap:anywhere]";

/**
 * Names the card whose numbers the entered card shows, with its amounts in words, or says the entry funds a new answer.
 * The region stays mounted so each change is announced: a region mounted with its text is not.
 */
export function MatchedCardNote({ funding, kind, chain }: { readonly funding: EnteredAnswerFunding; readonly kind: "answer" | "combination"; readonly chain: ChainConfig }) {
  const { card } = funding;
  return (
    <p className={card === null ? "sr-only" : NOTE_CLASS} aria-live="polite" aria-atomic="true">
      {card === null ? (
        newAnswerLine(kind)
      ) : (
        <>
          {matchedCardLine(card.title)}
          <span className="sr-only">{` ${formatAmount(funding.remaining, chain)} remaining of ${formatAmount(funding.required, chain)}.`}</span>
        </>
      )}
    </p>
  );
}

export interface EnteredAnswerFooterProps {
  readonly funding: Pick<EnteredAnswerFunding, "fundedPercent" | "deadline" | "remaining" | "required" | "fullyFunded">;
  /** What is funded, for the accessible names of the contribution field and Fund: the matched card's title when there is one. */
  readonly subject: string;
  readonly code: bigint | null;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
  readonly isFundDisabled: boolean;
  readonly verified: boolean;
}

/**
 * A card's funding and Fund, for fixed and entered cards alike, in the state the chain's time and the contract's funded
 * rulings give it: nothing remaining, a closed deadline or a fully funded ruling disables the field and Fund.
 */
export function EnteredAnswerFooter({ funding, subject, code, actions, chain, isFundDisabled, verified }: EnteredAnswerFooterProps) {
  const state = cardFundingState(funding, useNowSeconds());
  const statusId = useId();
  return (
    <>
      <FundingProgress percent={funding.fundedPercent} deadline={funding.deadline} state={state} verified={verified} statusId={statusId} />
      <p className="flex flex-col gap-1 text-sm text-klerosUIComponentsSecondaryText">
        <span>{"Remaining "}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Amount wei={funding.remaining} chain={chain} className={FACT_LEAD} />
          <span>{" of "}</span>
          <Amount wei={funding.required} chain={chain} />
        </span>
      </p>
      <FundAction
        subject={subject}
        code={code}
        suggested={funding.remaining}
        deadline={funding.deadline}
        state={state}
        describedBy={state === "open" ? undefined : statusId}
        actions={actions}
        chain={chain}
        isDisabled={isFundDisabled}
      />
    </>
  );
}

/** An int answer shows which answer it funds, since -1 and -2 land on reserved rulings. */
export function FreeInputCard({ freeInput, cards, actions, chain, isFundDisabled, verified }: FreeInputCardProps) {
  const titleId = useId();
  const [answer, setAnswer] = useState<AnswerInput | null>(null);
  const encoding = answer === null ? null : encodeAnswer(answer, { type: freeInput.type, precision: freeInput.precision });
  const code = encoding?.ok === true ? encoding.code : null;
  const error = encoding === null || encoding.ok ? undefined : ANSWER_ERROR_MESSAGES[encoding.error];
  const funding = enteredAnswerFunding(cards, freeInput, code);
  return (
    <li className={CARD_ITEM_CLASS} aria-labelledby={titleId}>
      <Card className={CARD_CLASS}>
        <h4 id={titleId} className={CARD_TITLE_CLASS}>
          Fund a new answer
        </h4>
        <AnswerField type={freeInput.type} onChange={setAnswer} error={error} />
        {freeInput.type === "int" ? (
          <p className={code === null ? "sr-only" : NOTE_CLASS} aria-live="polite" aria-atomic="true">
            {code === null ? null : (
              <>
                This card funds the answer: <strong className="font-semibold">{fundedIntAnswer(code)}</strong>
              </>
            )}
          </p>
        ) : null}
        <MatchedCardNote funding={funding} kind="answer" chain={chain} />
        <div className={CARD_FOOTER_CLASS}>
          <EnteredAnswerFooter
            funding={funding}
            subject={funding.card?.title ?? "the new answer"}
            code={code}
            actions={actions}
            chain={chain}
            isFundDisabled={isFundDisabled}
            verified={verified}
          />
        </div>
      </Card>
    </li>
  );
}
