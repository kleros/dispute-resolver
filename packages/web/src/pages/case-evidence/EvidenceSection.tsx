import type { ChainId, Unavailable } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useAtlasUpload } from "../../atlas";
import { foundLookup, queryKeys, useCaseRefresh, type CaseDispute, type CaseSectionProps, type CaseWriteContext } from "../../data";
import { SectionSkeleton, SectionUnavailable } from "../../ui";
import { EvidenceTimeline } from "./EvidenceTimeline";
import { SubmissionFeedbackNotice } from "./SubmissionFeedbackNotice";
import { SubmitEvidenceModal } from "./SubmitEvidenceModal";
import { submitControl } from "./submitControl";
import { useEvidenceSubmission, type EvidenceDraft } from "./useEvidenceSubmission";

const SECTION = "Evidence";
const EMPTY_DRAFT: EvidenceDraft = { title: "", description: "", attachment: null };
// The library's button text never wraps (`whitespace-pre`); the long view-only label must, at 375 px.
const BUTTON_CLASS = "h-auto max-w-full self-start [&_p]:whitespace-normal";

interface SubmitEvidenceProps {
  readonly context: CaseWriteContext;
  readonly chainId: ChainId;
  readonly disputeId: bigint;
}

/**
 * Without an upload service the button is disabled with no sentence, since a draft could never be submitted. A wallet on
 * another chain keeps it enabled, so that Submit can offer the switch.
 */
function SubmitEvidence({ context, chainId, disputeId }: SubmitEvidenceProps) {
  const submission = useEvidenceSubmission(context, chainId, disputeId);
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState<EvidenceDraft>(EMPTY_DRAFT);
  const { clear } = submission;

  const open = () => {
    clear();
    setOpen(true);
  };
  const close = useCallback(() => {
    setOpen(false);
    clear();
  }, [clear]);
  const submit = async () => {
    if (await submission.submit(draft)) {
      setDraft(EMPTY_DRAFT);
      setOpen(false);
    }
  };

  const needsWallet = submission.access.status === "needs-wallet";
  const uploadsUnconfigured = useAtlasUpload().availability === "unconfigured";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button text="Submit New Evidence" className={BUTTON_CLASS} isDisabled={needsWallet || uploadsUnconfigured} onPress={open} />
      {needsWallet ? <p className="text-sm text-klerosUIComponentsSecondaryText">Connect a wallet to submit evidence.</p> : null}
      {!isOpen && submission.feedback !== null ? <SubmissionFeedbackNotice feedback={submission.feedback} /> : null}
      <SubmitEvidenceModal
        isOpen={isOpen}
        draft={draft}
        onDraftChange={(patch) => {
          setDraft((current) => ({ ...current, ...patch }));
        }}
        onClose={close}
        onSubmit={() => {
          void submit();
        }}
        submitting={submission.inFlight}
        feedback={isOpen ? submission.feedback : null}
        access={submission.access}
      />
    </div>
  );
}

/**
 * The dispute details are only exposed through the "appeal" refresh, which also reads the lookup, the evidence and the
 * funding again.
 */
function useWriteContextRetry(dispute: CaseDispute): () => void {
  const client = useQueryClient();
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const binding = foundLookup(dispute)?.binding;
  const { chainId } = dispute;
  return useCallback(() => {
    if (binding !== undefined) void client.invalidateQueries({ queryKey: queryKeys.family(chainId, binding.arbitrated) });
    void refresh("appeal");
  }, [binding, chainId, client, refresh]);
}

function SubmitUnavailable({ dispute, error }: { readonly dispute: CaseDispute; readonly error: Unavailable }) {
  const retry = useWriteContextRetry(dispute);
  return <SectionUnavailable section="Evidence submission" error={error} onRetry={retry} />;
}

function SubmitControlView({ dispute }: { readonly dispute: CaseDispute }) {
  const control = submitControl(dispute);
  switch (control.kind) {
    case "hidden":
      return null;
    case "loading":
      return <Button text="Submit New Evidence" className={BUTTON_CLASS} isLoading isDisabled />;
    case "unavailable":
      return <SubmitUnavailable dispute={dispute} error={control.error} />;
    case "view-only":
      return (
        <div className="flex min-w-0 flex-col gap-2">
          <Button text="Go to Arbitrable Application to Submit Evidence" className={BUTTON_CLASS} isDisabled />
          <p className="text-sm text-klerosUIComponentsSecondaryText">This arbitrable contract does not accept evidence through the Dispute Resolver.</p>
        </div>
      );
    case "available":
      return <SubmitEvidence context={control.context} chainId={dispute.chainId} disputeId={dispute.disputeId} />;
  }
}

/** The list depends on the Dispute event too: a missing event makes it unavailable. */
function useEvidenceRetry(dispute: CaseDispute): () => void {
  const client = useQueryClient();
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const binding = foundLookup(dispute)?.binding;
  return useCallback(() => {
    if (binding !== undefined) void client.invalidateQueries({ queryKey: queryKeys.disputeEvent(binding.chainId, binding.disputeId, binding.arbitrated) });
    void refresh("evidence");
  }, [binding, client, refresh]);
}

/** The `AppealDecision` events belong to the dispute details, which are only exposed through the "appeal" refresh. */
function AppealMarkersUnavailable({ dispute, error }: { readonly dispute: CaseDispute; readonly error: Unavailable }) {
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const retry = useCallback(() => {
    void refresh("appeal");
  }, [refresh]);
  return <SectionUnavailable section="Appeal markers" error={error} onRetry={retry} />;
}

/** The appeal decisions only add the "Appealed" markers, so the entries never wait for them or disappear when they fail. */
function EvidenceListView({ dispute, chain }: CaseSectionProps) {
  const retry = useEvidenceRetry(dispute);
  const { evidence, disputeEvent, appealDecisions } = dispute;
  if (evidence.status === "loading") return <SectionSkeleton variant="text" lines={4} />;
  if (evidence.status === "unavailable") return <SectionUnavailable section={SECTION} error={evidence.error} onRetry={retry} />;
  const raisedAt = disputeEvent.status === "ready" && disputeEvent.value.status === "found" ? disputeEvent.value.event.createdAt : null;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {appealDecisions.status === "unavailable" ? <AppealMarkersUnavailable dispute={dispute} error={appealDecisions.error} /> : null}
      <EvidenceTimeline list={evidence.value} raisedAt={raisedAt} appealDecisions={appealDecisions.status === "ready" ? appealDecisions.value : []} chain={chain} />
    </div>
  );
}

/** The list and the submit control degrade independently. */
export function EvidenceSection({ dispute, chain }: CaseSectionProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <SubmitControlView dispute={dispute} />
      <EvidenceListView dispute={dispute} chain={chain} />
    </div>
  );
}
