import { buildEscrowAppealCall, type ChainConfig } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useState } from "react";
import { Notice, formatAmount } from "../../ui";
import { WriteStatusNotice, useWrite, useWriteAccess } from "../../wallet";
import {
  APPEAL_COST_CHANGED_TITLE,
  APPEAL_COST_CHECKING,
  APPEAL_COST_UNREAD_TITLE,
  APPEAL_HEADING,
  APPEAL_NEEDS_WALLET,
  ESCROW_EXPLANATION,
  appealCostChangedBody,
  appealCostUnreadBody,
} from "./copy";
import { BODY_TEXT_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface EscrowAppealPanelProps {
  readonly appealCost: bigint;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
}

/** The appeal cost read again on a press, before anything is built. */
type CostCheck = { readonly phase: "idle" | "checking" | "changed" } | { readonly phase: "unread"; readonly reason: string };

const IDLE: CostCheck = { phase: "idle" };
const CHECKING: CostCheck = { phase: "checking" };
const CHANGED: CostCheck = { phase: "changed" };

function CostCheckContent({ check, shownCost, chain }: { readonly check: CostCheck; readonly shownCost: bigint; readonly chain: ChainConfig }) {
  switch (check.phase) {
    case "checking":
      return <p className={BODY_TEXT_CLASS}>{APPEAL_COST_CHECKING}</p>;
    case "changed":
      return <Notice reveal variant="warning" title={APPEAL_COST_CHANGED_TITLE} body={appealCostChangedBody(formatAmount(shownCost, chain))} />;
    case "unread":
      return <Notice reveal variant="warning" title={APPEAL_COST_UNREAD_TITLE} body={appealCostUnreadBody(check.reason)} />;
    case "idle":
      return null;
  }
}

/**
 * Escrow V1 pays the arbitrator's whole appeal cost, which can change after the page read it. Each press reads it
 * again and sends it only when it equals the amount on the button; a different cost goes on the button for the next
 * press instead.
 */
export function EscrowAppealPanel({ appealCost, actions, chain }: EscrowAppealPanelProps) {
  const write = useWrite();
  const needsWallet = useWriteAccess(actions.pageChainId).status === "needs-wallet";
  const { context } = actions;
  const [pageCost, setPageCost] = useState(appealCost);
  /** A cost read on a press that differs from the page's, shown until the page reads a cost of its own. */
  const [readCost, setReadCost] = useState<bigint | null>(null);
  const [check, setCheck] = useState<CostCheck>(IDLE);
  if (pageCost !== appealCost) {
    setPageCost(appealCost);
    setReadCost(null);
    setCheck(IDLE);
  }
  const shownCost = readCost ?? appealCost;
  const busy = check.phase === "checking" || write.status.phase === "pending" || write.status.phase === "submitted";

  const appeal = async () => {
    if (context === null) return;
    write.reset();
    setCheck(CHECKING);
    const fresh = await context.readAppealCost();
    if (!fresh.ok) {
      setCheck({ phase: "unread", reason: fresh.error.message });
      return;
    }
    if (fresh.value !== shownCost) {
      setReadCost(fresh.value);
      setCheck(CHANGED);
      return;
    }
    setCheck(IDLE);
    const build = buildEscrowAppealCall({ binding: context.binding, family: context.family, localId: context.localId, appealCost: fresh.value });
    await write.execute(build, { pageChainId: actions.pageChainId, onMined: () => actions.refresh("appeal") });
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <h3>{APPEAL_HEADING}</h3>
        <p className={BODY_TEXT_CLASS}>{ESCROW_EXPLANATION}</p>
      </div>
      <Button
        text={`Appeal - ${formatAmount(shownCost, chain)}`}
        className="self-start"
        isLoading={busy}
        isDisabled={busy || context === null || needsWallet}
        onPress={() => {
          void appeal();
        }}
      />
      {needsWallet ? <p className={BODY_TEXT_CLASS}>{APPEAL_NEEDS_WALLET}</p> : null}
      {/* Mounted from the start, out of the layout while idle, so each result is announced: a region mounted with its text is not. */}
      <div className={check.phase === "idle" ? "sr-only" : undefined} aria-live="polite" aria-atomic="true">
        <CostCheckContent check={check} shownCost={shownCost} chain={chain} />
      </div>
      <WriteStatusNotice status={write.status} />
    </>
  );
}
