import { buildEscrowAppealCall, type ChainConfig, type UnixSeconds } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { Countdown, formatAmount } from "../../ui";
import { WriteStatusNotice, useWrite } from "../../wallet";
import { APPEAL_HEADING, ESCROW_EXPLANATION } from "./copy";
import { BODY_TEXT_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface EscrowAppealPanelProps {
  readonly appealCost: bigint;
  /** The end of the appeal period. */
  readonly deadline: UnixSeconds;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
}

/**
 * Escrow V1 in the appeal period (spec §10.2, §5.11): one appeal paying the arbitrator's appeal cost, labelled in the
 * chain's currency (D-10), sent through the chain guard (B3) to the arbitrated escrow (A22); the case refreshes once
 * the appeal is mined (D-07, P-02).
 */
export function EscrowAppealPanel({ appealCost, deadline, actions, chain }: EscrowAppealPanelProps) {
  const write = useWrite();
  const busy = write.status.phase === "pending" || write.status.phase === "submitted";
  const { context } = actions;

  const appeal = async () => {
    if (context === null) return;
    const build = buildEscrowAppealCall({ binding: context.binding, family: context.family, localId: context.localId, appealCost });
    await write.execute(build, { pageChainId: actions.pageChainId, onMined: () => actions.refresh("appeal") });
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <h3>{APPEAL_HEADING}</h3>
        <p className={BODY_TEXT_CLASS}>{ESCROW_EXPLANATION}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="text-klerosUIComponentsSecondaryText">Time left to appeal</span>
          <Countdown target={deadline} className="font-semibold" />
        </p>
      </div>
      <Button
        text={`Appeal - ${formatAmount(appealCost, chain)}`}
        className="self-start"
        isLoading={busy}
        isDisabled={busy || context === null}
        onPress={() => {
          void appeal();
        }}
      />
      <WriteStatusNotice status={write.status} />
    </>
  );
}
