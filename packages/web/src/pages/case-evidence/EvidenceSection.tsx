import type { ChainId, DisputeLookup, Unavailable } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { queryKeys, useCaseRefresh, type CaseDispute, type CaseSectionProps, type CaseWriteContext, type SectionData } from "../../data";
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
 * "Submit New Evidence", its modal, and, once the modal is closed, the outcome of a submission still in progress or just
 * mined. Without a wallet the button is disabled and says why; a wallet on another chain keeps it enabled, and Submit
 * then offers the switch.
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
      // D-44: every field, the attachment included, starts empty after a mined submission.
      setDraft(EMPTY_DRAFT);
      setOpen(false);
    }
  };

  const needsWallet = submission.access.status === "needs-wallet";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button text="Submit New Evidence" className={BUTTON_CLASS} isDisabled={needsWallet} onPress={open} />
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

function foundBinding(lookup: SectionData<DisputeLookup>) {
  return lookup.status === "ready" && lookup.value.status === "found" ? lookup.value.binding : undefined;
}

/**
 * Reads the write context again: the family detection and the dispute details. Data exposes the details only through
 * the "appeal" refresh, which also reads the lookup, the evidence and the funding again.
 */
function useWriteContextRetry(dispute: CaseDispute): () => void {
  const client = useQueryClient();
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const binding = foundBinding(dispute.lookup);
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

/** The submit control of spec 5.14, from the write context alone (S-5). */
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

/** Reads the Dispute event and the evidence again: the list depends on both (a missing event makes it unavailable). */
function useEvidenceRetry(dispute: CaseDispute): () => void {
  const client = useQueryClient();
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const binding = foundBinding(dispute.lookup);
  return useCallback(() => {
    if (binding !== undefined) void client.invalidateQueries({ queryKey: queryKeys.disputeEvent(binding.chainId, binding.disputeId, binding.arbitrated) });
    void refresh("evidence");
  }, [binding, client, refresh]);
}

/** Reads the dispute details again, which hold the `AppealDecision` events; data exposes them only through the "appeal" refresh. */
function AppealMarkersUnavailable({ dispute, error }: { readonly dispute: CaseDispute; readonly error: Unavailable }) {
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const retry = useCallback(() => {
    void refresh("appeal");
  }, [refresh]);
  return <SectionUnavailable section="Appeal markers" error={error} onRetry={retry} />;
}

/**
 * The evidence list. The appeal decisions only add the "Appealed" markers (D-03): the entries show while they load, and
 * when they failed the entries stay, with a notice that the markers are missing (D-36).
 */
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

/**
 * The evidence panel of spec 5.14 (the Evidence accordion item of the case page): the submit control and modal, then
 * the evidence list. The list and the submit control degrade independently (D-36, S-5).
 */
export function EvidenceSection({ dispute, chain }: CaseSectionProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <SubmitControlView dispute={dispute} />
      <EvidenceListView dispute={dispute} chain={chain} />
    </div>
  );
}
