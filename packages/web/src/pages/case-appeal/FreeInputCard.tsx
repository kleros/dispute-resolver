import {
  cardFundingState,
  encodeAnswer,
  enteredAnswerFunding,
  type AnswerInput,
  type ChainConfig,
  type CrowdfundingSet,
  type EnteredAnswerFunding,
  type FreeInputCard as FreeInput,
} from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import { useId, useState } from "react";
import { Amount, FACT_LEAD, formatAmount, useNowSeconds, utcText } from "../../ui";
import { AnswerField } from "./AnswerField";
import { ANSWER_ERROR_MESSAGES, fundedIntAnswer } from "./answer";
import { ANSWER_NOT_ACCEPTED, matchedCardLine, newAnswerLine } from "./copy";
import { FundAction } from "./FundAction";
import { FundingProgress } from "./FundingProgress";
import { CARD_HEAD_CLASS, CARD_TITLE_CLASS, WIDE_CARD_CLASS, WIDE_CARD_FUNDING_CLASS, WIDE_CARD_ITEM_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

interface FreeInputCardProps {
  readonly freeInput: FreeInput;
  /** The panel's cards and the round's totals: an answer with a card shows that card's funding, any other what it holds. */
  readonly round: Pick<CrowdfundingSet, "cards" | "contributed">;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
  readonly isFundDisabled: boolean;
}

const NOTE_CLASS = "text-sm [overflow-wrap:anywhere]";

interface MatchedCardNoteProps {
  readonly funding: EnteredAnswerFunding;
  readonly kind: "answer" | "combination";
  readonly chain: ChainConfig;
  /** `false` while the entry is past the dispute's number of choices: its field error says why, so the note says nothing. */
  readonly accepted: boolean;
}

function MatchedCardText({ funding, kind, chain }: Omit<MatchedCardNoteProps, "accepted">) {
  const { card } = funding;
  if (card === null) return <>{newAnswerLine(kind)}</>;
  return (
    <>
      {matchedCardLine(card.title)}
      <span className="sr-only">{` ${formatAmount(funding.remaining, chain)} remaining of ${formatAmount(funding.required, chain)}.`}</span>
    </>
  );
}

/**
 * Names the card whose numbers the entered card shows, with its amounts in words, or says the entry funds a new answer.
 * The region stays mounted so each change is announced: a region mounted with its text is not.
 */
export function MatchedCardNote({ funding, kind, chain, accepted }: MatchedCardNoteProps) {
  return (
    <p className={funding.card === null ? "sr-only" : NOTE_CLASS} aria-live="polite" aria-atomic="true">
      {accepted ? <MatchedCardText funding={funding} kind={kind} chain={chain} /> : null}
    </p>
  );
}

interface EnteredAnswerFooterProps {
  readonly funding: Pick<EnteredAnswerFunding, "fundedPercent" | "deadline" | "remaining" | "required" | "fullyFunded">;
  /** What is funded, for the accessible names of the contribution field and Fund: the matched card's title when there is one. */
  readonly subject: string;
  /** The answer as the write's toast quotes it: the matched card's title, or the entered answer. */
  readonly answer: string;
  readonly code: bigint | null;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
  readonly isFundDisabled: boolean;
}

/**
 * A card's funding and Fund, for fixed and entered cards alike, in the state the chain's time and the contract's funded
 * rulings give it: nothing remaining, a closed deadline or a fully funded ruling disables the field and Fund.
 */
export function EnteredAnswerFooter({ funding, subject, answer, code, actions, chain, isFundDisabled }: EnteredAnswerFooterProps) {
  const state = cardFundingState(funding, useNowSeconds());
  const statusId = useId();
  return (
    <>
      <FundingProgress percent={funding.fundedPercent} deadline={funding.deadline} state={state} statusId={statusId} />
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
        answer={answer}
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

/** The entered answer as the court will show the ruling: an int read back from its code, a date as its UTC time. */
function enteredAnswerText(answer: AnswerInput | null, code: bigint | null): string {
  if (answer === null) return "";
  if (answer.type === "datetime") return utcText(answer.timestamp);
  if (answer.type === "int" && code !== null) return fundedIntAnswer(code);
  return answer.value;
}

/**
 * An int answer shows which answer it funds, since -1 and -2 land on reserved rulings. The card takes a row of its own:
 * its head, a field under the title, is taller than any title, so it never sets the fixed cards' head height.
 */
export function FreeInputCard({ freeInput, round, actions, chain, isFundDisabled }: FreeInputCardProps) {
  const titleId = useId();
  const [answer, setAnswer] = useState<AnswerInput | null>(null);
  const encoding = answer === null ? null : encodeAnswer(answer, { type: freeInput.type, precision: freeInput.precision });
  const typedCode = encoding?.ok === true ? encoding.code : null;
  const tooHigh = typedCode !== null && typedCode > freeInput.highestCode;
  const code = tooHigh ? null : typedCode;
  const encodingError = encoding === null || encoding.ok ? undefined : ANSWER_ERROR_MESSAGES[encoding.error];
  const error = tooHigh ? ANSWER_NOT_ACCEPTED : encodingError;
  const funding = enteredAnswerFunding(round, freeInput, code);
  return (
    <li className={WIDE_CARD_ITEM_CLASS} aria-labelledby={titleId}>
      <Card className={WIDE_CARD_CLASS}>
        <div className={CARD_HEAD_CLASS}>
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
          <MatchedCardNote funding={funding} kind="answer" chain={chain} accepted={!tooHigh} />
        </div>
        <div className={WIDE_CARD_FUNDING_CLASS}>
          <EnteredAnswerFooter
            funding={funding}
            subject={funding.card?.title ?? "the new answer"}
            answer={funding.card?.title ?? enteredAnswerText(answer, code)}
            code={code}
            actions={actions}
            chain={chain}
            isFundDisabled={isFundDisabled}
          />
        </div>
      </Card>
    </li>
  );
}
