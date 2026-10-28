import { combinationCode, combinationTitle, enteredAnswerFunding, type ChainConfig, type CrowdfundingCard, type MultipleSelectComposer } from "@dispute-resolver/core";
import { Card, Checkbox } from "@kleros/ui-components-library";
import { useId, useState } from "react";
import { EnteredAnswerFooter, MatchedCardNote } from "./FreeInputCard";
import { CARD_TITLE_CLASS, COMPOSER_CARD_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface ComposerCardProps {
  readonly composer: MultipleSelectComposer;
  /** The panel's fixed cards: a combination that already has one shows that card's funding. */
  readonly cards: readonly CrowdfundingCard[];
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
  readonly isFundDisabled: boolean;
  /** Whether the registry verified the contract's rules, which words the card's deadline. */
  readonly verified: boolean;
}

/**
 * Above four options the combinations are not enumerated as cards, so the user ticks the options of the answer and
 * funds that combination (bitmask + 1). Ticking nothing funds "None", which is a combination too.
 */
export function ComposerCard({ composer, cards, actions, chain, isFundDisabled, verified }: ComposerCardProps) {
  const titleId = useId();
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const code = combinationCode([...selected].sort((a, b) => a - b));
  const funding = enteredAnswerFunding(cards, composer, code);
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
    <li className="flex min-w-0 md:col-span-2 lg:col-span-3" aria-labelledby={titleId}>
      <Card className={COMPOSER_CARD_CLASS}>
        <div className="flex min-w-0 flex-col gap-4">
          <h4 id={titleId} className={CARD_TITLE_CLASS}>
            Fund another combination
          </h4>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-sm text-klerosUIComponentsSecondaryText">Tick the options of the answer you want to fund. Ticking none funds “None”.</legend>
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
            Answer to fund: <strong className="font-semibold">{combinationTitle(code - 1n, composer.titles)}</strong>
          </p>
          <MatchedCardNote funding={funding} kind="combination" chain={chain} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:border-l lg:border-klerosUIComponentsStroke lg:pl-8">
          <EnteredAnswerFooter
            funding={funding}
            subject={funding.card?.title ?? "the selected combination"}
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
