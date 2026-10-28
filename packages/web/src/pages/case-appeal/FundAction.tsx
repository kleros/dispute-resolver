import { buildFundAppealCall, type CardFundingState, type ChainConfig } from "@dispute-resolver/core";
import { BigNumberField, Button } from "@kleros/ui-components-library";
import { useState } from "react";
import { formatEther } from "viem";
import { useChainNow } from "../../ui";
import { WriteStatusNotice, useWrite, type WriteStatus } from "../../wallet";
import { parseContribution } from "./contribution";
import type { AppealActions } from "./useAppealActions";

export interface FundActionProps {
  /** What is funded, for the accessible names of the field and the button ("Yes", "the new answer"). */
  readonly subject: string;
  /** `null` while the card has no answer to fund. */
  readonly code: bigint | null;
  /** The suggested contribution: what remains to fund of the card, or of the answer entered into it. */
  readonly suggested: bigint;
  /** When funding closes for what is funded, and whether it still can be; only `open` takes a contribution. */
  readonly deadline: number;
  readonly state: CardFundingState;
  /** The id of the text saying why the field and Fund take nothing, while the card is closed or fully funded. */
  readonly describedBy?: string;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
  /** Fund stays disabled whatever the amount, as without a wallet; the contribution stays editable. */
  readonly isDisabled?: boolean;
}

function inFlight(status: WriteStatus): boolean {
  return status.phase === "checking" || status.phase === "pending" || status.phase === "submitted";
}

/**
 * The field follows the suggested amount until the user edits it, and again once a funding is mined or the answer
 * under the field changes. When the suggested amount drops to 0, or funding closes, the edit is dropped, so the disabled
 * field shows what remains. The deadline is checked again at the press against the chain's time, since the shared clock
 * that closes the card ticks only every 30 seconds.
 *
 * The amount sent is always the text the field shows. The library field reports a parsed value through `onChange` but
 * stays silent for text it treats as unfinished, such as "-" alone, so the raw text also arrives through `onInput`.
 * For one input event React runs `onInput` before `onChange`, so a value the field rewrites (a negative amount becomes
 * 0) ends on what the field shows.
 */
export function FundAction({ subject, code, suggested, deadline, state, describedBy, actions, chain, isDisabled = false }: FundActionProps) {
  const write = useWrite();
  const chainNow = useChainNow();
  /** The contribution as the field shows it once the user edited it; `null` while it follows the suggested amount. */
  const [edited, setEdited] = useState<string | null>(null);
  const [previousCode, setPreviousCode] = useState(code);
  const locked = suggested === 0n || state !== "open";
  if (code !== previousCode) {
    setPreviousCode(code);
    setEdited(null);
  }
  if (locked && edited !== null) setEdited(null);
  const contribution = parseContribution(edited ?? formatEther(suggested));
  const busy = inFlight(write.status);
  const { context } = actions;
  const canFund = !isDisabled && context !== null && code !== null && contribution.ok && !locked && !busy;
  const description = describedBy === undefined ? {} : { "aria-describedby": describedBy };

  const fund = async () => {
    if (context === null || code === null || !contribution.ok) return;
    const build = buildFundAppealCall({
      binding: context.binding,
      family: context.family,
      localId: context.localId,
      ruling: code,
      value: contribution.wei,
      deadline,
      nowSeconds: chainNow(),
    });
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
          isDisabled={locked}
          variant={edited !== null && !contribution.ok ? "error" : undefined}
          message={edited !== null && !contribution.ok ? contribution.message : undefined}
          inputProps={{
            "aria-label": `Contribution (${chain.currency}) for ${subject}`,
            ...description,
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
          {...description}
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
