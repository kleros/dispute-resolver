import type { AppealPanel, ChainConfig, CrowdfundingCard } from "@dispute-resolver/core";
import { Notice } from "../../ui";
import { useWriteAccess } from "../../wallet";
import { ComposerCard } from "./ComposerCard";
import { APPEAL_HEADING, CROWDFUNDING_EXPLANATION, FUND_NEEDS_WALLET, REWARDS_BODY, REWARDS_TITLE } from "./copy";
import { FreeInputCard } from "./FreeInputCard";
import { FundingCard } from "./FundingCard";
import { BODY_TEXT_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface CrowdfundingPanelProps {
  readonly panel: Extract<AppealPanel, { readonly kind: "crowdfunding" }>;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
}

/**
 * A stable key per card. Codes are unique per origin in core's card set, but reserved keys come from untrusted
 * meta-evidence ("0x1" and "0x01" name one code), so repeats are numbered.
 */
function keyedCards(cards: readonly CrowdfundingCard[]): readonly { readonly key: string; readonly card: CrowdfundingCard }[] {
  const seen = new Map<string, number>();
  return cards.map((card) => {
    const base = `${card.origin}:${card.code.toString()}`;
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    return { key: `${base}:${String(repeat)}`, card };
  });
}

/** Without a wallet every Fund is disabled; a wallet on another chain can still press Fund, which then offers the switch. */
export function CrowdfundingPanel({ panel, actions, chain }: CrowdfundingPanelProps) {
  const needsWallet = useWriteAccess(actions.pageChainId).status === "needs-wallet";
  return (
    <>
      <div className="flex flex-col gap-2">
        <h3>{APPEAL_HEADING}</h3>
        <p className={BODY_TEXT_CLASS}>{CROWDFUNDING_EXPLANATION}</p>
      </div>
      <Notice variant="info" title={REWARDS_TITLE} body={REWARDS_BODY} />
      {needsWallet ? <p className={BODY_TEXT_CLASS}>{FUND_NEEDS_WALLET}</p> : null}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Rulings to fund">
        {keyedCards(panel.cards).map(({ key, card }) => (
          <FundingCard key={key} card={card} actions={actions} chain={chain} isFundDisabled={needsWallet} />
        ))}
        {panel.freeInput === null ? null : <FreeInputCard freeInput={panel.freeInput} cards={panel.cards} actions={actions} chain={chain} isFundDisabled={needsWallet} />}
        {panel.composer === null ? null : <ComposerCard composer={panel.composer} cards={panel.cards} actions={actions} chain={chain} isFundDisabled={needsWallet} />}
      </ul>
    </>
  );
}
