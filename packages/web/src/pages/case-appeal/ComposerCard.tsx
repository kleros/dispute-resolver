import {
  NONE_OF_THE_OPTIONS_TEXT,
  combinationCode,
  combinationTitle,
  enteredAnswerFunding,
  type ChainConfig,
  type CrowdfundingCard,
  type MultipleSelectComposer,
} from "@dispute-resolver/core";
import { Card, Checkbox } from "@kleros/ui-components-library";
import { useId, useState } from "react";
import { COMBINATION_NOT_ACCEPTED } from "./copy";
import { EnteredAnswerFooter, MatchedCardNote } from "./FreeInputCard";
import { CARD_HEAD_CLASS, CARD_TITLE_CLASS, WIDE_CARD_CLASS, WIDE_CARD_FUNDING_CLASS, WIDE_CARD_ITEM_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface ComposerCardProps {
  readonly composer: MultipleSelectComposer;
  /** The panel's fixed cards: a combination that already has one shows that card's funding. */
  readonly cards: readonly CrowdfundingCard[];
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
  readonly isFundDisabled: boolean;
}

/**
 * Above four options the combinations are not enumerated as cards, so the user ticks the options of the answer and
 * funds that combination (bitmask + 1).
 */
export function ComposerCard({ composer, cards, actions, chain, isFundDisabled }: ComposerCardProps) {
  const titleId = useId();
  const errorId = useId();
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const ticked = combinationCode([...selected].sort((a, b) => a - b));
  const tooHigh = ticked > composer.highestCode;
  const code = tooHigh ? null : ticked;
  const funding = enteredAnswerFunding(cards, composer, code);
  const answer = combinationTitle(ticked - 1n, composer.titles);
  const options = composer.titles.map((title, position) => ({ title, position, id: `option-${String(position)}` }));

  const toggle = (position: number, isSelected: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) next.add(position);
      else next.delete(position);
      return next;
    });
  };

  return (
    <li className={WIDE_CARD_ITEM_CLASS} aria-labelledby={titleId}>
      <Card className={WIDE_CARD_CLASS}>
        <div className={CARD_HEAD_CLASS}>
          <h4 id={titleId} className={CARD_TITLE_CLASS}>
            Fund another combination
          </h4>
          <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={tooHigh ? errorId : undefined}>
            <legend className="mb-2 text-sm text-klerosUIComponentsSecondaryText">
              Tick the options of the answer you want to fund. Ticking none funds “{NONE_OF_THE_OPTIONS_TEXT}”.
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((option) => (
                <Checkbox
                  key={option.id}
                  small
                  className="min-w-0 [overflow-wrap:anywhere]"
                  label={option.title}
                  isSelected={selected.has(option.position)}
                  onChange={(isSelected) => {
                    toggle(option.position, isSelected);
                  }}
                />
              ))}
            </div>
          </fieldset>
          <p className="text-sm [overflow-wrap:anywhere]" aria-live="polite">
            Answer to fund: <strong className="font-semibold">{answer}</strong>
          </p>
          <div className={tooHigh ? undefined : "sr-only"} aria-live="polite">
            {tooHigh ? (
              <p id={errorId} className="text-sm text-klerosUIComponentsError">
                {COMBINATION_NOT_ACCEPTED}
              </p>
            ) : null}
          </div>
          <MatchedCardNote funding={funding} kind="combination" chain={chain} accepted={!tooHigh} />
        </div>
        <div className={WIDE_CARD_FUNDING_CLASS}>
          <EnteredAnswerFooter
            funding={funding}
            subject={funding.card?.title ?? answer}
            answer={funding.card?.title ?? answer}
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
