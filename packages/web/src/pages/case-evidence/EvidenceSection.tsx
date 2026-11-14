import { FIRST_EVIDENCE_PAGE, type EvidenceOrder, type EvidencePageRequest, type Unavailable } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, type ReactNode } from "react";
import { useAtlasUpload } from "../../atlas";
import { foundLookup, queryKeys, useCaseRefresh, useEvidencePage, type CaseDispute, type CaseSectionProps, type CaseWriteContext } from "../../data";
import { SectionSkeleton, SectionUnavailable } from "../../ui";
import { EvidenceOrderSelect, ORDER_LABELS } from "./EvidenceOrderSelect";
import { EvidenceTimeline, type PageAnnouncement } from "./EvidenceTimeline";
import { SubmissionFeedbackNotice } from "./SubmissionFeedbackNotice";
import { SubmitEvidenceModal } from "./SubmitEvidenceModal";
import { submitControl } from "./submitControl";
import { useEvidenceSubmission, type EvidenceDraft } from "./useEvidenceSubmission";

const SECTION = "Evidence";
const EMPTY_DRAFT: EvidenceDraft = { title: "", description: "", attachment: null };
// The library's button text never wraps (`whitespace-pre`); the long view-only label must, at 375 px.
const BUTTON_CLASS = "h-auto max-w-full self-start [&_p]:whitespace-normal";
// From `sm` the submit button and the Order select share a line, centred on each other. A grid, not a wrapping flex row:
// a wrapping row breaks at the long view-only label's unwrapped width and would push the select to a line of its own,
// while the grid's first column makes that label wrap inside the button. A submit control's sentence or notice spans the
// line below. Without the select, the control keeps its own column.
const ROW_CLASS = "flex min-w-0 flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center";
const ROW_BUTTON_CLASS = `${BUTTON_CLASS} sm:self-center sm:justify-self-start`;
const ROW_CONTROL_CLASS = "sm:contents";
const BELOW_CLASS = "sm:col-span-2";

/** How a submit control sits: alone, or in the Submit row beside the Order select. */
interface Layout {
  readonly button: string;
  readonly control: string;
  readonly below: string;
}

const ALONE: Layout = { button: BUTTON_CLASS, control: "", below: "" };
const IN_ROW: Layout = { button: ROW_BUTTON_CLASS, control: ROW_CONTROL_CLASS, below: BELOW_CLASS };

/** A notice under the submit control spans the Submit row's line below; alone, it is not wrapped. */
function BelowRow({ layout, children }: { readonly layout: Layout; readonly children: ReactNode }) {
  return layout.below === "" ? children : <div className={`min-w-0 ${layout.below}`}>{children}</div>;
}

interface SubmitEvidenceProps {
  readonly context: CaseWriteContext;
  readonly chainId: number;
  readonly disputeId: bigint;
  readonly layout: Layout;
}

/**
 * Without an upload service the button is disabled with no sentence, since a draft could never be submitted. A wallet on
 * another chain keeps it enabled, so that Submit can offer the switch.
 */
function SubmitEvidence({ context, chainId, disputeId, layout }: SubmitEvidenceProps) {
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
    <div className={`flex min-w-0 flex-col gap-3 ${layout.control}`}>
      <Button text="Submit New Evidence" className={layout.button} isDisabled={needsWallet || uploadsUnconfigured} onPress={open} />
      {needsWallet ? <p className={`text-sm text-klerosUIComponentsSecondaryText ${layout.below}`}>Connect a wallet to submit evidence.</p> : null}
      {/* The modal can be closed while a submission runs: what stops it before its write is shown here then. */}
      {!isOpen && submission.notice !== null ? (
        <BelowRow layout={layout}>
          <SubmissionFeedbackNotice notice={submission.notice} />
        </BelowRow>
      ) : null}
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
        notice={isOpen ? submission.notice : null}
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

function SubmitUnavailable({ dispute, error, layout }: { readonly dispute: CaseDispute; readonly error: Unavailable; readonly layout: Layout }) {
  const retry = useWriteContextRetry(dispute);
  return (
    <BelowRow layout={layout}>
      <SectionUnavailable section="Evidence submission" error={error} onRetry={retry} />
    </BelowRow>
  );
}

function SubmitControlView({ dispute, control, layout }: { readonly dispute: CaseDispute; readonly control: ReturnType<typeof submitControl>; readonly layout: Layout }) {
  switch (control.kind) {
    case "hidden":
      return null;
    case "loading":
      return <Button text="Submit New Evidence" className={layout.button} isLoading isDisabled />;
    case "unavailable":
      return <SubmitUnavailable dispute={dispute} error={control.error} layout={layout} />;
    case "view-only":
      return (
        <div className={`flex min-w-0 flex-col gap-2 ${layout.control}`}>
          <Button text="Go to Arbitrable Application to Submit Evidence" className={layout.button} isDisabled />
          <p className={`text-sm text-klerosUIComponentsSecondaryText ${layout.below}`}>This arbitrable contract does not accept evidence through the Dispute Resolver.</p>
        </div>
      );
    case "available":
      return <SubmitEvidence context={control.context} chainId={dispute.chainId} disputeId={dispute.disputeId} layout={layout} />;
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

interface EvidenceListViewProps extends CaseSectionProps {
  readonly request: EvidencePageRequest;
  readonly onPage: (page: number) => void;
  readonly announcement: PageAnnouncement | null;
}

/** The appeal decisions only add the "Appealed" markers, so the entries never wait for them or disappear when they fail. */
function EvidenceListView({ dispute, chain, request, onPage, announcement }: EvidenceListViewProps) {
  const retry = useEvidenceRetry(dispute);
  const pageState = useEvidencePage(dispute, request);
  const { evidence, disputeEvent, appealDecisions } = dispute;
  if (evidence.status === "loading") return <SectionSkeleton variant="text" lines={4} />;
  if (evidence.status === "unavailable") return <SectionUnavailable section={SECTION} error={evidence.error} onRetry={retry} />;
  const raisedAt = disputeEvent.status === "ready" && disputeEvent.value.status === "found" ? disputeEvent.value.event.createdAt : null;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {appealDecisions.status === "unavailable" ? <AppealMarkersUnavailable dispute={dispute} error={appealDecisions.error} /> : null}
      <EvidenceTimeline
        list={evidence.value}
        request={request}
        pageState={pageState}
        raisedAt={raisedAt}
        appealDecisions={appealDecisions.status === "ready" ? appealDecisions.value : []}
        chain={chain}
        onPage={onPage}
        announcement={announcement}
      />
    </div>
  );
}

/**
 * The list and the submit control degrade independently. The order and the page live here, beside the submit control, so
 * the select keeps its place and focus while the list below changes; fewer than two entries have nothing to order.
 */
export function EvidenceSection({ dispute, chain }: CaseSectionProps) {
  const [request, setRequest] = useState<EvidencePageRequest>(FIRST_EVIDENCE_PAGE);
  const [announcement, setAnnouncement] = useState<PageAnnouncement | null>(null);
  const control = submitControl(dispute);
  const { evidence } = dispute;
  const orderable = evidence.status === "ready" && evidence.value.logs.length > 1;
  const reorder = (order: EvidenceOrder) => {
    const next = { order, page: 1 };
    setRequest(next);
    setAnnouncement({ request: next, lead: `${ORDER_LABELS[order]}. ` });
  };
  const openPage = (page: number) => {
    const next = { order: request.order, page };
    setRequest(next);
    setAnnouncement({ request: next, lead: "" });
  };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {control.kind === "hidden" && !orderable ? null : (
        <div className={orderable ? ROW_CLASS : "flex min-w-0 flex-col"}>
          <SubmitControlView dispute={dispute} control={control} layout={orderable ? IN_ROW : ALONE} />
          {orderable ? <EvidenceOrderSelect value={request.order} onChange={reorder} /> : null}
        </div>
      )}
      <EvidenceListView dispute={dispute} chain={chain} request={request} onPage={openPage} announcement={announcement} />
    </div>
  );
}
