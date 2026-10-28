import type { AppealPanel, ChainConfig, CrowdfundingCard, FundingTerms } from "@dispute-resolver/core";
import { Notice } from "../../ui";
import { useWriteAccess } from "../../wallet";
import { ComposerCard } from "./ComposerCard";
import {
  APPEAL_HEADING,
  FUND_NEEDS_WALLET,
  REWARDS_TITLE,
  UNVERIFIED_BODY,
  UNVERIFIED_TITLE,
  crowdfundingExplanation,
  fundingBasis,
  rewardsBody,
  soleFundedLine,
  tieBody,
  tieTitle,
} from "./copy";
import { FreeInputCard } from "./FreeInputCard";
import { FundingCard } from "./FundingCard";
import { BODY_TEXT_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface CrowdfundingPanelProps {
  readonly panel: Extract<AppealPanel, { readonly kind: "crowdfunding" }>;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
}

/** A stable key per card. Core's card set codes each card once per origin; a repeat is still numbered rather than trusted. */
function keyedCards(cards: readonly CrowdfundingCard[]): readonly { readonly key: string; readonly card: CrowdfundingCard }[] {
  const seen = new Map<string, number>();
  return cards.map((card) => {
    const base = `${card.origin}:${card.code.toString()}`;
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    return { key: `${base}:${String(repeat)}`, card };
  });
}

/**
 * A contract whose rules were not verified gets the standard deadlines with a warning that they are only that; a
 * verified one in a tie gets how its sides are set instead of the usual deadline basis.
 */
function RulesNotice({ terms }: { readonly terms: FundingTerms }) {
  if (!terms.verified) return <Notice variant="warning" title={UNVERIFIED_TITLE} body={UNVERIFIED_BODY} />;
  if (terms.tie === null) return null;
  return <Notice variant="info" title={tieTitle(terms.tie)} body={tieBody(terms.tie, terms)} />;
}

/**
 * What the funding so far means on a contract verified to let a lone fully funded ruling win: the one fully funded card,
 * when there is exactly one. Two fully funded rulings have already sent the case to new jurors.
 */
function soleFunded({ cards, terms }: CrowdfundingPanelProps["panel"]): string | null {
  if (!terms.verified || terms.settlement !== "sole-funded-wins") return null;
  const [only, ...others] = cards.filter((card) => card.fullyFunded);
  return only !== undefined && others.length === 0 ? soleFundedLine(only.title, terms.noun) : null;
}

/** Without a wallet every Fund is disabled; a wallet on another chain can still press Fund, which then offers the switch. */
export function CrowdfundingPanel({ panel, actions, chain }: CrowdfundingPanelProps) {
  const needsWallet = useWriteAccess(actions.pageChainId).status === "needs-wallet";
  const { terms } = panel;
  const rewards = rewardsBody(terms);
  const soleFundedText = soleFunded(panel);
  const cardProps = { actions, chain, isFundDisabled: needsWallet, verified: terms.verified };
  return (
    <>
      <div className="flex flex-col gap-2">
        <h3>{APPEAL_HEADING}</h3>
        <p className={BODY_TEXT_CLASS}>{crowdfundingExplanation(terms)}</p>
        {soleFundedText === null ? null : <p className={`${BODY_TEXT_CLASS} [overflow-wrap:anywhere]`}>{soleFundedText}</p>}
        {terms.verified && terms.tie === null ? <p className={BODY_TEXT_CLASS}>{fundingBasis(terms)}</p> : null}
      </div>
      <RulesNotice terms={terms} />
      {rewards === null ? null : <Notice variant="info" title={REWARDS_TITLE} body={rewards} />}
      {needsWallet ? <p className={BODY_TEXT_CLASS}>{FUND_NEEDS_WALLET}</p> : null}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Rulings to fund">
        {keyedCards(panel.cards).map(({ key, card }) => (
          <FundingCard key={key} card={card} {...cardProps} />
        ))}
        {panel.freeInput === null ? null : <FreeInputCard freeInput={panel.freeInput} cards={panel.cards} {...cardProps} />}
        {panel.composer === null ? null : <ComposerCard composer={panel.composer} cards={panel.cards} {...cardProps} />}
      </ul>
    </>
  );
}
