import { hasAppealPanel, type ChainConfig, type FamilyDetection, type Period } from "@dispute-resolver/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { queryKeys, useCaseRefresh, type CaseDispute, type SectionData } from "../../data";
import { SectionBoundary, SectionSkeleton, useRevealIn } from "../../ui";
import { AppealSection } from "../case-appeal";
import { EvidenceSection } from "../case-evidence";
import { CaseOverview, DecisionAlert, DisputeSummary, DisputeTimeline, MetaEvidenceSourceNotice, RealityNotice, ScriptDetailsNotice } from "../case-summary";
import { CaseAccordion, type CaseAccordionItem } from "./CaseAccordion";
import { CompatibilityBanner } from "./CompatibilityBanner";
import { CASE_BAND } from "./PageStates";
import { foundDispute } from "./pageState";
import { QuestionPanel } from "./QuestionPanel";
import type { BoundaryRetries } from "./useBoundaryRetries";

const FIRST_APPEAL_PERIOD = 3;

/**
 * Whether the accordion has an Appeal item, or `undefined` until the family is known. A family that could not be detected
 * keeps the item, whose body says why and offers a Retry.
 */
function hasAppealItem(period: Period, family: SectionData<FamilyDetection>): boolean | undefined {
  if (period < FIRST_APPEAL_PERIOD) return false;
  if (family.status === "loading") return undefined;
  return family.status === "unavailable" || hasAppealPanel(period, family.value);
}

/**
 * The Appeal item decision for the dispute, kept while its family is read again. The library accordion remembers its open
 * item by index, so the list must not change once it has rendered, and swapping it for a skeleton would remount it with
 * every item closed. A Retry that reads a failed detection again puts the family back to loading, since it has no data
 * to keep, so the last decision for this dispute stands until that read settles.
 */
function useAppealItem(disputeKey: string, period: Period | undefined, family: SectionData<FamilyDetection>): boolean | undefined {
  const [decided, setDecided] = useState<{ readonly disputeKey: string; readonly hasItem: boolean }>();
  const fresh = period === undefined ? undefined : hasAppealItem(period, family);
  const hasItem = fresh ?? (decided?.disputeKey === disputeKey ? decided.hasItem : undefined);
  if (hasItem !== undefined && (decided?.disputeKey !== disputeKey || decided.hasItem !== hasItem)) setDecided({ disputeKey, hasItem });
  return hasItem;
}

interface DisputeSectionsProps {
  readonly dispute: CaseDispute;
  readonly chain: ChainConfig;
  /** The boundaries' Retry, from the component that reads the case. */
  readonly retries: BoundaryRetries;
}

/**
 * Each section renders as soon as its own data allows, behind its own boundary keyed by the chain and dispute so a failure
 * never outlives its dispute; Retry reads that section's data again and remounts its boundary on the new read.
 */
export function DisputeSections({ dispute, chain, retries }: DisputeSectionsProps) {
  const client = useQueryClient();
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const found = foundDispute(dispute);
  const disputeKey = `${dispute.chainId.toString()}:${dispute.disputeId.toString()}`;
  const props = { dispute, chain };
  const appealItem = useAppealItem(disputeKey, found?.dispute.period, dispute.family);
  // Only the accordion as a whole reveals: a CSS animation restarts each time `hidden` is removed, so a reveal inside a
  // body would replay on every open, nested in the body's own fade.
  const accordionReveal = useRevealIn(appealItem === undefined);

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

  const displayScope = `evidence-display:${disputeKey}`;
  const displayRetry = {
    key: retries.key(displayScope),
    onRetry: () => {
      retries.retry(displayScope, rereadMetaEvidence);
    },
  };

  const { view } = dispute;
  const viewOnly = view.status === "ready" && view.value.exists && view.value.compatibility === "view-only";

  const items: CaseAccordionItem[] = [
    { title: "Question", body: boundary("question", "Question", rereadMetaEvidence, <QuestionPanel {...props} onRetry={retryQuestion} />) },
    { title: "Evidence", body: boundary("evidence", "Evidence", rereadEvidence, <EvidenceSection {...props} />) },
  ];
  if (appealItem === true) {
    items.unshift({ title: "Appeal", body: boundary("appeal", "Appeal", rereadAppeal, <AppealSection {...props} />) });
  }

  return (
    <>
      {view.status === "ready" && !view.value.exists ? null : (
        <div className={CASE_BAND}>
          {boundary("overview", "Dispute details", rereadDetails, <CaseOverview {...props} />)}
          {boundary("timeline", "Timeline", rereadDetails, <DisputeTimeline {...props} />)}
        </div>
      )}
      {/* The notices come before the decision: they qualify everything below the band. */}
      {boundary("meta-evidence-source", "Meta-evidence source", rereadMetaEvidence, <MetaEvidenceSourceNotice {...props} />)}
      {boundary("script-details", "Script details notice", rereadMetaEvidence, <ScriptDetailsNotice {...props} />)}
      {viewOnly ? <CompatibilityBanner /> : null}
      {boundary("decision", "Decision", rereadAppeal, <DecisionAlert {...props} />)}
      {boundary("summary", "Dispute summary", rereadMetaEvidence, <DisputeSummary {...props} displayRetry={displayRetry} />)}
      {boundary("reality", "Reality notice", rereadMetaEvidence, <RealityNotice {...props} />)}
      {appealItem === undefined ? (
        <SectionSkeleton variant="bars" lines={3} />
      ) : (
        <CaseAccordion key={`${disputeKey}:${items.map((item) => item.title).join("|")}`} items={items} className={accordionReveal} />
      )}
    </>
  );
}
