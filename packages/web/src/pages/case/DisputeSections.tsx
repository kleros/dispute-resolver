import type { ChainConfig } from "@dispute-resolver/core";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, useCaseRefresh, type CaseDispute } from "../../data";
import { SectionBoundary, SectionSkeleton } from "../../ui";
import { AppealSection } from "../case-appeal";
import { EvidenceSection } from "../case-evidence";
import { CaseOverview, DecisionAlert, DisputeSummary, DisputeTimeline, RealityNotice } from "../case-summary";
import { CaseAccordion, type CaseAccordionItem } from "./CaseAccordion";
import { CompatibilityBanner } from "./CompatibilityBanner";
import { foundDispute } from "./pageState";
import { QuestionPanel } from "./QuestionPanel";

/** The appeal and execution periods, where the Appeal panel exists (spec 5.11). */
const FIRST_APPEAL_PERIOD = 3;

interface DisputeSectionsProps {
  readonly dispute: CaseDispute;
  readonly chain: ChainConfig;
}

/**
 * The sections of one dispute, top to bottom (ARCHITECTURE.md §11.5): the case header with the info row, the
 * compatibility banner, the summary, the timeline, the decision, the Reality notice, then the accordion of Appeal,
 * Question and Evidence. Each renders as soon as its own data allows (P-20) behind its own boundary, keyed by the chain
 * and dispute so a failure never outlives its dispute (D-36, S-3); Retry reads that section's data again.
 */
export function DisputeSections({ dispute, chain }: DisputeSectionsProps) {
  const client = useQueryClient();
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const found = foundDispute(dispute);
  const disputeKey = `${dispute.chainId.toString()}:${dispute.disputeId.toString()}`;
  const props = { dispute, chain };

  const retryMetaEvidence = () => {
    if (found !== undefined) void client.invalidateQueries({ queryKey: queryKeys.metaEvidence(dispute.chainId, dispute.disputeId, found.binding.arbitrated) });
  };
  const retryDetails = () => {
    void refresh("appeal");
    void client.invalidateQueries({ queryKey: queryKeys.courts(dispute.chainId) });
  };
  const retryAppeal = () => {
    void refresh("appeal");
  };
  const retryEvidence = () => {
    void refresh("evidence");
    if (found !== undefined) void client.invalidateQueries({ queryKey: queryKeys.disputeEvent(dispute.chainId, dispute.disputeId, found.binding.arbitrated) });
  };

  const { view } = dispute;
  const viewOnly = view.status === "ready" && view.value.exists && view.value.compatibility === "view-only";

  const items: CaseAccordionItem[] = [
    { title: "Question", body: <SectionBoundary key={`question:${disputeKey}`} section="Question" onRetry={retryMetaEvidence}><QuestionPanel {...props} onRetry={retryMetaEvidence} /></SectionBoundary> },
    { title: "Evidence", body: <SectionBoundary key={`evidence:${disputeKey}`} section="Evidence" onRetry={retryEvidence}><EvidenceSection {...props} /></SectionBoundary> },
  ];
  if (found !== undefined && found.dispute.period >= FIRST_APPEAL_PERIOD) {
    items.unshift({ title: "Appeal", body: <SectionBoundary key={`appeal:${disputeKey}`} section="Appeal" onRetry={retryAppeal}><AppealSection {...props} /></SectionBoundary> });
  }

  return (
    <>
      <SectionBoundary key={`overview:${disputeKey}`} section="Dispute details" onRetry={retryDetails}>
        <CaseOverview {...props} />
      </SectionBoundary>
      {viewOnly ? <CompatibilityBanner /> : null}
      <SectionBoundary key={`summary:${disputeKey}`} section="Dispute summary" onRetry={retryMetaEvidence}>
        <DisputeSummary {...props} />
      </SectionBoundary>
      <SectionBoundary key={`timeline:${disputeKey}`} section="Timeline" onRetry={retryDetails}>
        <DisputeTimeline {...props} />
      </SectionBoundary>
      <SectionBoundary key={`decision:${disputeKey}`} section="Decision" onRetry={retryAppeal}>
        <DecisionAlert {...props} />
      </SectionBoundary>
      <SectionBoundary key={`reality:${disputeKey}`} section="Reality notice" onRetry={retryMetaEvidence}>
        <RealityNotice {...props} />
      </SectionBoundary>
      {found === undefined ? <SectionSkeleton variant="bars" lines={3} /> : <CaseAccordion key={`${disputeKey}:${String(items.length)}`} items={items} />}
    </>
  );
}
