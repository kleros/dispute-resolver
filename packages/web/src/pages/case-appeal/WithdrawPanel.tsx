import { buildWithdrawCalls, type ChainConfig, type WithdrawState } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useState } from "react";
import { Notice, formatAmount } from "../../ui";
import { WriteStatusNotice, useWriteSequence } from "../../wallet";
import { WITHDRAW_ELIGIBLE, WITHDRAW_HEADING, WITHDRAW_NOTHING, WITHDRAW_NO_ACCOUNT } from "./copy";
import { BODY_TEXT_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface WithdrawPanelProps {
  readonly state: WithdrawState;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
}

function WithdrawExplanation({ state }: { readonly state: WithdrawState }) {
  if (state.status === "nothing") return <p className={BODY_TEXT_CLASS}>{WITHDRAW_NOTHING}</p>;
  let note = null;
  if (state.status === "no-account") note = <Notice variant="info" title="Wallet required" body={WITHDRAW_NO_ACCOUNT} />;
  else if (state.status === "unavailable") note = <Notice variant="warning" title="Withdrawable amount unavailable" body={state.error.message} />;
  else if (state.items.length > 1) {
    note = (
      <p className="text-sm">
        Your rewards and refunds come from {state.items.length} contributions, so withdrawing them takes {state.items.length} transactions, one after the other. Confirm each one in
        your wallet.
      </p>
    );
  }
  return (
    <>
      <p className={BODY_TEXT_CLASS}>{WITHDRAW_ELIGIBLE}</p>
      {note}
    </>
  );
}

/**
 * One transaction per ruling contributed to, sent in sequence for the beneficiary the amounts were read for. The
 * withdrawable amount is refreshed once, after the last mined withdrawal.
 */
export function WithdrawPanel({ state, actions, chain }: WithdrawPanelProps) {
  const sequence = useWriteSequence();
  const [running, setRunning] = useState(false);
  const { context } = actions;

  const withdraw = async () => {
    if (state.status !== "available" || context === null) return;
    const builds = buildWithdrawCalls({ binding: context.binding, family: context.family, localId: context.localId, beneficiary: state.beneficiary, items: state.items });
    setRunning(true);
    try {
      await sequence.execute(builds, { pageChainId: actions.pageChainId, onMined: () => actions.refresh("withdraw") });
    } finally {
      setRunning(false);
    }
  };

  const progress = sequence.status;
  return (
    <>
      <div className="flex flex-col gap-2">
        <h3>{WITHDRAW_HEADING}</h3>
        <WithdrawExplanation state={state} />
      </div>
      {state.status === "available" ? (
        <div className="flex flex-col border-t border-klerosUIComponentsStroke pt-4">
          <Button
            text={`Withdraw ${formatAmount(state.total, chain)}`}
            className="self-start"
            isLoading={running}
            isDisabled={running || context === null}
            onPress={() => {
              void withdraw();
            }}
          />
        </div>
      ) : null}
      {progress === null ? null : <WriteStatusNotice status={progress.current} progress={{ index: progress.index, total: progress.total }} />}
    </>
  );
}
