import type { ChainConfig } from "@dispute-resolver/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryKeys, useCaseRefresh, type CaseDispute } from "../../data";
import { SectionBoundary, SectionSkeleton } from "../../ui";
import { AppealSection } from "../case-appeal";
import { EvidenceSection } from "../case-evidence";
import { CaseOverview, DecisionAlert, DisputeSummary, DisputeTimeline, RealityNotice } from "../case-summary";
import { CaseAccordion, type CaseAccordionItem } from "./CaseAccordion";
import { CompatibilityBanner } from "./CompatibilityBanner";
import { foundDispute } from "./pageState";
import { QuestionPanel } from "./QuestionPanel";
import type { BoundaryRetries } from "./useBoundaryRetries";

/** The appeal and execution periods, where the Appeal panel exists (spec 5.11). */
const FIRST_APPEAL_PERIOD = 3;

interface DisputeSectionsProps {
  readonly dispute: CaseDispute;
  readonly chain: ChainConfig;
  /** The boundaries' Retry, from the component that reads the case. */
  readonly retries: BoundaryRetries;
}

/**
 * The sections of one dispute, top to bottom (ARCHITECTURE.md §11.5): the case header with the info row, the
 * compatibility banner, the summary, the timeline, the decision, the Reality notice, then the accordion of Appeal,
 * Question and Evidence. Each renders as soon as its own data allows (P-20) behind its own boundary, keyed by the chain
 * and dispute so a failure never outlives its dispute (D-36, S-3); Retry reads that section's data again and remounts
 * its boundary on the new read.
 */
export function DisputeSections({ dispute, chain, retries }: DisputeSectionsProps) {
  const client = useQueryClient();
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const found = foundDispute(dispute);
  const disputeKey = `${dispute.chainId.toString()}:${dispute.disputeId.toString()}`;
  const props = { dispute, chain };

  const rereadMetaEvidence = async () => {
    if (found !== undefined) await client.invalidateQueries({ queryKey: queryKeys.metaEvidence(dispute.chainId, dispute.disputeId, found.binding.arbitrated) });
  };
  const rereadDetails = () => Promise.all([refresh("appeal"), client.invalidateQueries({ queryKey: queryKeys.courts(dispute.chainId) })]);
  const rereadAppeal = () => refresh("appeal");
  const rereadEvidence = () =>
    Promise.all([
      refresh("evidence"),
      found === undefined ? undefined : client.invalidateQueries({ queryKey: queryKeys.disputeEvent(dispute.chainId, dispute.disputeId, found.binding.arbitrated) }),
    ]);
  const retryQuestion = () => {
    void rereadMetaEvidence();
  };

  /** One section behind its boundary; `name` keys it, `reread` is what its Retry reads again. */
  const boundary = (name: string, section: string, reread: () => Promise<unknown>, children: ReactNode) => {
    const scope = `${name}:${disputeKey}`;
    const retry = () => {
      retries.retry(scope, reread);
    };
    return (
      <SectionBoundary key={retries.key(scope)} section={section} onRetry={retry}>
        {children}
      </SectionBoundary>
    );
  };

  const { view } = dispute;
  const viewOnly = view.status === "ready" && view.value.exists && view.value.compatibility === "view-only";

  const items: CaseAccordionItem[] = [
    { title: "Question", body: boundary("question", "Question", rereadMetaEvidence, <QuestionPanel {...props} onRetry={retryQuestion} />) },
    { title: "Evidence", body: boundary("evidence", "Evidence", rereadEvidence, <EvidenceSection {...props} />) },
  ];
  if (found !== undefined && found.dispute.period >= FIRST_APPEAL_PERIOD) {
    items.unshift({ title: "Appeal", body: boundary("appeal", "Appeal", rereadAppeal, <AppealSection {...props} />) });
  }

  return (
    <>
      {boundary("overview", "Dispute details", rereadDetails, <CaseOverview {...props} />)}
      {viewOnly ? <CompatibilityBanner /> : null}
      {boundary("summary", "Dispute summary", rereadMetaEvidence, <DisputeSummary {...props} />)}
      {boundary("timeline", "Timeline", rereadDetails, <DisputeTimeline {...props} />)}
      {boundary("decision", "Decision", rereadAppeal, <DecisionAlert {...props} />)}
      {boundary("reality", "Reality notice", rereadMetaEvidence, <RealityNotice {...props} />)}
      {found === undefined ? <SectionSkeleton variant="bars" lines={3} /> : <CaseAccordion key={`${disputeKey}:${String(items.length)}`} items={items} />}
    </>
  );
}
