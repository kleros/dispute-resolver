import { buildFundAppealCall, type CardFundingState, type ChainConfig } from "@dispute-resolver/core";
import { Button, TextField } from "@kleros/ui-components-library";
import { useId, useState } from "react";
import { formatEther } from "viem";
import { formatAmount, useChainNow } from "../../ui";
import { useWrite, type WriteStatus } from "../../wallet";
import { parseContribution } from "./contribution";
import { fundWording } from "./copy";
import type { AppealActions } from "./useAppealActions";

interface FundActionProps {
  /** What is funded, for the accessible names of the field and the button ("Yes", "the new answer"). */
  readonly subject: string;
  /** The answer as the write's toast quotes it: the card's title, or the entered answer. */
  readonly answer: string;
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
 * The field follows the suggested amount until the user edits it, and again once a funding is mined. A typed amount is
 * kept when the answer under the field changes; it is dropped when the suggested amount drops to 0 or funding closes, so
 * the disabled field shows what remains. The deadline is checked again at the press against the chain's time, since the
 * shared clock that closes the card ticks only every 30 seconds.
 *
 * A plain text field, not the library's number field, so the amount sent is always the text the field shows and a typed
 * comma can be read as the decimal point.
 */
export function FundAction({ subject, answer, code, suggested, deadline, state, describedBy, actions, chain, isDisabled = false }: FundActionProps) {
  const write = useWrite();
  const chainNow = useChainNow();
  const subjectId = useId();
  /** The contribution as the field shows it once the user edited it; `null` while it follows the suggested amount. */
  const [edited, setEdited] = useState<string | null>(null);
  const locked = suggested === 0n || state !== "open";
  if (locked && edited !== null) setEdited(null);
  const text = edited ?? formatEther(suggested);
  const contribution = parseContribution(text);
  const error = edited === null || contribution.ok ? undefined : contribution.message;
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
    const outcome = await write.execute(build, {
      pageChainId: actions.pageChainId,
      onMined: () => actions.refresh("appeal"),
      wording: fundWording(answer, formatAmount(contribution.wei, chain)),
    });
    if (outcome.phase === "mined") setEdited(null);
  };

  return (
    <div className="flex flex-wrap items-start gap-2">
      <TextField
        className="w-auto min-w-0 flex-1 basis-40"
        label={`Contribution (${chain.currency})`}
        aria-labelledby={subjectId}
        value={text}
        isDisabled={locked}
        isInvalid={error !== undefined}
        variant={error === undefined ? undefined : "error"}
        message={error}
        inputProps={{ inputMode: "decimal", autoComplete: "off", ...description }}
        onChange={setEdited}
      />
      {/* What is funded follows the visible label as a second label, hidden so it is read only in the field's name. */}
      <span id={subjectId} hidden>{`for ${subject}`}</span>
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
  );
}
