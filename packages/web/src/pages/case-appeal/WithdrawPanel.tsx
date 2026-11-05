import { buildWithdrawCalls, type Address, type ChainConfig, type RulingNoun, type WithdrawState } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useState } from "react";
import { Notice, formatAmount } from "../../ui";
import { WriteStatusNotice, useWallet, useWriteSequence, type WalletState, type WriteSequenceStatus } from "../../wallet";
import { WITHDRAW_HEADING, WITHDRAW_NO_ACCOUNT, withdrawEligible, withdrawNothing, withdrawnLine } from "./copy";
import { BODY_TEXT_CLASS } from "./styles";
import type { AppealActions } from "./useAppealActions";

export interface WithdrawPanelProps {
  readonly state: WithdrawState;
  readonly noun: RulingNoun;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
}

/** What a press of Withdraw asked for: the amount read for the beneficiary at that moment. */
interface Withdrawal {
  readonly beneficiary: Address;
  readonly amount: bigint;
}

/**
 * The amount a finished sequence withdrew: every transaction mined, for the wallet still connected. Another account's
 * empty panel, or a sequence that stopped part way, says nothing about it.
 */
function withdrawnAmount(withdrawal: Withdrawal | null, progress: WriteSequenceStatus | null, wallet: WalletState): bigint | null {
  if (withdrawal === null || progress === null || wallet.status !== "connected") return null;
  const finished = progress.current.phase === "mined" && progress.index === progress.total - 1;
  return finished && wallet.address.toLowerCase() === withdrawal.beneficiary.toLowerCase() ? withdrawal.amount : null;
}

function WithdrawExplanation({ state, noun }: { readonly state: WithdrawState; readonly noun: RulingNoun }) {
  if (state.status === "nothing") return <p className={BODY_TEXT_CLASS}>{withdrawNothing(noun)}</p>;
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
      <p className={BODY_TEXT_CLASS}>{withdrawEligible(noun)}</p>
      {note}
    </>
  );
}

/**
 * One transaction per ruling contributed to, sent in sequence for the beneficiary the amounts were read for. The
 * withdrawable amount is refreshed once, after the last mined withdrawal.
 */
export function WithdrawPanel({ state, noun, actions, chain }: WithdrawPanelProps) {
  const sequence = useWriteSequence();
  const wallet = useWallet();
  const [running, setRunning] = useState(false);
  const [withdrawal, setWithdrawal] = useState<Withdrawal | null>(null);
  const { context } = actions;

  const withdraw = async () => {
    if (state.status !== "available" || context === null) return;
    const builds = buildWithdrawCalls({ binding: context.binding, family: context.family, localId: context.localId, beneficiary: state.beneficiary, items: state.items });
    setWithdrawal({ beneficiary: state.beneficiary, amount: state.total });
    setRunning(true);
    try {
      await sequence.execute(builds, { pageChainId: actions.pageChainId, onMined: () => actions.refresh("withdraw") });
    } finally {
      setRunning(false);
    }
  };

  const progress = sequence.status;
  const withdrawn = state.status === "nothing" ? withdrawnAmount(withdrawal, progress, wallet) : null;
  return (
    <>
      <div className="flex flex-col gap-2">
        <h3>{WITHDRAW_HEADING}</h3>
        {/* Mounted empty before the refresh empties the panel: a live region mounted with its text is not announced. */}
        <p className={withdrawn === null ? "sr-only" : BODY_TEXT_CLASS} aria-live="polite" aria-atomic="true">
          {withdrawn === null ? null : withdrawnLine(formatAmount(withdrawn, chain))}
        </p>
        {withdrawn === null ? <WithdrawExplanation state={state} noun={noun} /> : null}
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
