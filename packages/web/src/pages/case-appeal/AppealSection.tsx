import type { AppealPanel, ChainConfig } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import type { CaseSectionProps, CaseWriteContext, SectionData } from "../../data";
import { appealPanelAttributes } from "../../parity";
import { Notice, SectionSkeleton, SectionUnavailable } from "../../ui";
import {
  ESCROW_ENDED,
  FEES_UNAVAILABLE_BODY,
  FEES_UNAVAILABLE_TITLE,
  HANDLED_BY_ARBITRABLE_BODY,
  HANDLED_BY_ARBITRABLE_TITLE,
  WITHDRAW_HEADING,
  WITHDRAW_UNSUPPORTED,
} from "./copy";
import { CrowdfundingPanel } from "./CrowdfundingPanel";
import { EscrowAppealPanel } from "./EscrowAppealPanel";
import { WithdrawPanel } from "./WithdrawPanel";
import { useAppealActions, type AppealActions } from "./useAppealActions";
import { useAppealRetry } from "./useAppealRetry";

const SECTION = "Appeal";

/** `data-withdrawable-wei` (§12.1): the withdrawable sum in execution, 0 when there is nothing, absent when it is not known. */
function withdrawableWei(panel: AppealPanel): bigint | null {
  if (panel.kind !== "withdraw") return null;
  switch (panel.state.status) {
    case "available":
      return panel.state.total;
    case "nothing":
      return 0n;
    case "no-account":
    case "unavailable":
      return null;
  }
}

/** The kinds whose body offers a write. */
function hasActions(panel: AppealPanel): boolean {
  return panel.kind === "crowdfunding" || panel.kind === "escrow-appeal" || (panel.kind === "withdraw" && panel.state.status === "available");
}

/** Why the panel's actions cannot be built: the write context of the dispute failed to load (D-36). */
function WriteContextNotice({ write }: { readonly write: SectionData<CaseWriteContext> }) {
  if (write.status !== "unavailable") return null;
  return <Notice variant="warning" title="Appeal actions unavailable" body={write.error.message} />;
}

interface PanelBodyProps {
  readonly panel: AppealPanel;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
  /** Reads the panel's data again (D-36), for the fees notice. */
  readonly onRetry: () => void;
}

function PanelBody({ panel, actions, chain, onRetry }: PanelBodyProps) {
  switch (panel.kind) {
    case "hidden":
      return null;
    case "handled-by-arbitrable":
      return <Notice variant="info" title={HANDLED_BY_ARBITRABLE_TITLE} body={HANDLED_BY_ARBITRABLE_BODY} />;
    case "escrow-appeal":
      return <EscrowAppealPanel appealCost={panel.appealCost} deadline={panel.deadline} actions={actions} chain={chain} />;
    case "escrow-ended":
      return <h3>{ESCROW_ENDED}</h3>;
    case "crowdfunding":
      return <CrowdfundingPanel panel={panel} actions={actions} chain={chain} />;
    case "fees-unavailable":
      return (
        <div className="flex flex-col items-start gap-3">
          <Notice variant="warning" title={FEES_UNAVAILABLE_TITLE} body={`${FEES_UNAVAILABLE_BODY}\n\nReason: ${panel.error.message}`} className="w-full" />
          <Button text="Retry" aria-label="Retry the appeal fees" variant="secondary" small onPress={onRetry} />
        </div>
      );
    case "withdraw":
      return <WithdrawPanel state={panel.state} actions={actions} chain={chain} />;
    case "withdraw-unsupported":
      return (
        <>
          <h3>{WITHDRAW_HEADING}</h3>
          <Notice variant="info" title="Withdrawals unavailable here" body={WITHDRAW_UNSUPPORTED} />
        </>
      );
  }
}

/**
 * The body of the case page's Appeal panel (spec §5.11, 06 §1): the panel core builds for the dispute's family and
 * period, every kind of `AppealPanel` included (D-46, D-47), its writes going through the wallet's chain guard (B3,
 * D-48) and refreshing the case once mined (D-07, P-02). While the panel loads it shows a placeholder; a panel that
 * could not be built, or whose fees could not be calculated, says why with a Retry that reads its data again (D-36).
 * The `appeal-panel` hook is on a wrapper element (§12.1).
 */
export function AppealSection({ dispute, chain }: CaseSectionProps) {
  const actions = useAppealActions(dispute, chain);
  const retry = useAppealRetry(dispute);
  const { appealPanel } = dispute;
  if (appealPanel.status === "loading") return <SectionSkeleton variant="grid" lines={3} />;
  if (appealPanel.status === "unavailable") return <SectionUnavailable section={SECTION} error={appealPanel.error} onRetry={retry} />;
  const panel = appealPanel.value;
  return (
    <div className="flex min-w-0 flex-col gap-4" {...appealPanelAttributes({ kind: panel.kind, withdrawableWei: withdrawableWei(panel) })}>
      {hasActions(panel) ? <WriteContextNotice write={dispute.write} /> : null}
      <PanelBody panel={panel} actions={actions} chain={chain} onRetry={retry} />
    </div>
  );
}
