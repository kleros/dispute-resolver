import { buildFundAppealCall, type ChainConfig } from "@dispute-resolver/core";
import { BigNumberField, Button } from "@kleros/ui-components-library";
import { useState } from "react";
import { formatEther } from "viem";
import { WriteStatusNotice, useWrite, type WriteStatus } from "../../wallet";
import { parseContribution } from "./contribution";
import type { AppealActions } from "./useAppealActions";

export interface FundActionProps {
  /** What is funded, for the accessible names of the field and the button ("Yes", "the new answer"). */
  readonly subject: string;
  /** The ruling code to fund; `null` while the card has no answer to fund (spec §5.12: Fund stays disabled). */
  readonly code: bigint | null;
  /** The suggested contribution: the remaining amount of a fixed card, the loser total of a free input or composer. */
  readonly suggested: bigint;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
}

function inFlight(status: WriteStatus): boolean {
  return status.phase === "pending" || status.phase === "submitted";
}

/**
 * The contribution field, Fund and the write's status (spec §5.12 card contents and fund action). The field shows the
 * suggested amount and follows it until the user edits it (D-54); once a funding is mined it follows the refreshed
 * amount again. When the suggested amount drops to 0 the edit is dropped, so the disabled field shows 0. Fund is
 * disabled when the suggested amount is 0, without an answer to fund, for an amount that cannot be sent (D-14), and
 * while a funding is in flight. The write goes through the wallet's chain guard (B3, D-48) to the arbitrable the
 * arbitrator names (A22, B10), and the case refreshes once it is mined (D-07, P-02).
 *
 * The amount sent is always the text the field shows. The library field reports a parsed value through `onChange` but
 * stays silent for text it treats as unfinished, such as "-" alone, so the raw text also arrives through `onInput`.
 * For one input event React runs `onInput` before `onChange`, so a value the field rewrites (a negative amount becomes
 * 0) ends on what the field shows.
 */
export function FundAction({ subject, code, suggested, actions, chain }: FundActionProps) {
  const write = useWrite();
  /** The contribution as the field shows it once the user edited it; `null` while it follows the suggested amount. */
  const [edited, setEdited] = useState<string | null>(null);
  const nothingToFund = suggested === 0n;
  if (nothingToFund && edited !== null) setEdited(null);
  const contribution = parseContribution(edited ?? formatEther(suggested));
  const busy = inFlight(write.status);
  const { context } = actions;
  const canFund = context !== null && code !== null && contribution.ok && !nothingToFund && !busy;

  const fund = async () => {
    if (context === null || code === null || !contribution.ok) return;
    const build = buildFundAppealCall({ binding: context.binding, family: context.family, localId: context.localId, ruling: code, value: contribution.wei });
    const outcome = await write.execute(build, { pageChainId: actions.pageChainId, onMined: () => actions.refresh("appeal") });
    if (outcome.phase === "mined") setEdited(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-2">
        <BigNumberField
          className="w-auto min-w-0 flex-1 basis-40"
          label={`Contribution (${chain.currency})`}
          value={edited === null ? formatEther(suggested) : undefined}
          minValue="0"
          step="0.01"
          isDisabled={nothingToFund}
          variant={edited !== null && !contribution.ok ? "error" : undefined}
          message={edited !== null && !contribution.ok ? contribution.message : undefined}
          inputProps={{
            "aria-label": `Contribution (${chain.currency}) for ${subject}`,
            onInput: (event) => {
              setEdited(event.currentTarget.value);
            },
          }}
          onChange={(value) => {
            setEdited(value.toFixed());
          }}
        />
        <Button
          text="Fund"
          aria-label={`Fund ${subject}`}
          className="mt-6 shrink-0"
          isLoading={busy}
          isDisabled={!canFund}
          onPress={() => {
            void fund();
          }}
        />
      </div>
      <WriteStatusNotice status={write.status} />
    </div>
  );
}
