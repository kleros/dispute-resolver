import type { AppealPanel, ChainConfig, UnavailableCode } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import type { CaseSectionProps, CaseWriteContext, SectionData } from "../../data";
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

function hasActions(panel: AppealPanel): boolean {
  return panel.kind === "crowdfunding" || panel.kind === "escrow-appeal" || (panel.kind === "withdraw" && panel.state.status === "available");
}

/** Codes a new read can change; a missing getter, bad data or an unread network stay as they are. */
const RETRYABLE: ReadonlySet<UnavailableCode> = new Set(["rpc-error", "reverted", "not-found"]);

function WriteContextNotice({ write }: { readonly write: SectionData<CaseWriteContext> }) {
  if (write.status !== "unavailable") return null;
  return <Notice variant="warning" title="Appeal actions unavailable" body={write.error.message} />;
}

interface PanelBodyProps {
  readonly panel: AppealPanel;
  readonly actions: AppealActions;
  readonly chain: ChainConfig;
  readonly onRetry: () => void;
}

function PanelBody({ panel, actions, chain, onRetry }: PanelBodyProps) {
  switch (panel.kind) {
    case "hidden":
      return null;
    case "handled-by-arbitrable":
      return <Notice variant="info" title={HANDLED_BY_ARBITRABLE_TITLE} body={HANDLED_BY_ARBITRABLE_BODY} />;
    case "escrow-appeal":
      return <EscrowAppealPanel appealCost={panel.appealCost} actions={actions} chain={chain} />;
    case "escrow-ended":
      return <h3>{ESCROW_ENDED}</h3>;
    case "crowdfunding":
      return <CrowdfundingPanel panel={panel} actions={actions} chain={chain} />;
    case "fees-unavailable":
      return (
        <div className="flex flex-col items-start gap-3">
          <Notice variant="warning" title={FEES_UNAVAILABLE_TITLE} body={`${FEES_UNAVAILABLE_BODY}\n\nReason: ${panel.error.message}`} className="w-full" />
          {RETRYABLE.has(panel.error.code) ? <Button text="Retry" aria-label="Retry the appeal fees" variant="secondary" small onPress={onRetry} /> : null}
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

export function AppealSection({ dispute, chain }: CaseSectionProps) {
  const actions = useAppealActions(dispute, chain);
  const retry = useAppealRetry(dispute);
  const { appealPanel } = dispute;
  if (appealPanel.status === "loading") return <SectionSkeleton variant="text" lines={6} />;
  if (appealPanel.status === "unavailable") return <SectionUnavailable section={SECTION} error={appealPanel.error} onRetry={retry} />;
  const panel = appealPanel.value;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {hasActions(panel) ? <WriteContextNotice write={dispute.write} /> : null}
      <PanelBody panel={panel} actions={actions} chain={chain} onRetry={retry} />
    </div>
  );
}
