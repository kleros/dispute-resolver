import { resolveArbitrableAppLink, toAttachmentLink, type MetaEvidence, type MetaEvidenceResult, type Unavailable } from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import { useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { APP_CONFIG } from "../../env";
import { testId } from "../../parity";
import { Attachment, ExternalLink, SafeMarkdown } from "../../safe-content";
import { SectionBoundary, SectionSkeleton } from "../../ui";
import { queryKeys, useCoreDeps, type CaseDispute, type CaseSectionProps, type SectionData } from "../../data";
import { existingView, foundLookup, type FoundLookup } from "./caseState";
import { EvidenceDisplay } from "./EvidenceDisplay";
import { Parties } from "./Parties";
import { SectionContent } from "./SectionContent";

const NO_META_EVIDENCE: Unavailable = {
  code: "not-found",
  message: "This dispute has no meta-evidence, so its title and description cannot be shown.",
};

const APP_LINK_CLASS =
  "inline-flex items-center gap-1.5 rounded-base font-semibold text-klerosUIComponentsPrimaryBlue underline-offset-2 [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-klerosUIComponentsPrimaryBlue";

/**
 * The meta-evidence the summary shows: an accepted one, or the "invalid or tampered" placeholder that replaces a rejected
 * one (A2). A dispute without meta-evidence, or whose meta-evidence failed to load, has no summary (spec 5.4, D-36).
 */
function summaryData(metaEvidence: SectionData<MetaEvidenceResult>): SectionData<MetaEvidence> {
  if (metaEvidence.status !== "ready") return metaEvidence;
  const result = metaEvidence.value;
  switch (result.status) {
    case "ok":
    case "invalid":
      return { status: "ready", value: result.metaEvidence };
    case "missing":
      return { status: "unavailable", error: NO_META_EVIDENCE };
    case "failed":
      return { status: "unavailable", error: result.error };
  }
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h4v4M13 3 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

interface SummaryCardProps {
  readonly metaEvidence: MetaEvidence;
  readonly dispute: CaseDispute;
  readonly chain: CaseSectionProps["chain"];
  readonly found: FoundLookup | undefined;
}

function SummaryCard({ metaEvidence, dispute, chain, found }: SummaryCardProps) {
  const headingId = useId();
  const { gateway } = useCoreDeps();
  const appLink = resolveArbitrableAppLink(metaEvidence.arbitrableInterfaceURI, APP_CONFIG.selfHosts);
  const attachment = toAttachmentLink(metaEvidence.fileURI, gateway);
  return (
    <section aria-labelledby={headingId}>
      <Card round className="flex h-auto w-full flex-col gap-6 p-4 lg:px-8 lg:py-6">
        <header className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-klerosUIComponentsSecondaryText">Interact with the dispute</p>
          <h2 id={headingId} className="text-xl font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere] lg:text-2xl">
            <span {...testId("case-title")}>{metaEvidence.title}</span>
            {metaEvidence.title === "" ? <span className="text-klerosUIComponentsSecondaryText">Untitled dispute</span> : null}
          </h2>
        </header>
        <SafeMarkdown source={metaEvidence.description} testId="case-description" />
        <Parties aliases={metaEvidence.aliases} chain={chain} />
        {appLink === null && attachment === null ? null : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-klerosUIComponentsStroke pt-4">
            {appLink === null ? null : (
              <ExternalLink href={appLink} testId="link-arbitrable-app" className={APP_LINK_CLASS}>
                Go to the arbitrable application
                <ExternalIcon />
              </ExternalLink>
            )}
            <Attachment attachment={attachment} testId="link-meta-evidence-file" />
          </div>
        )}
        {found === undefined ? null : (
          <SectionBoundary key={`${dispute.chainId.toString()}:${dispute.disputeId.toString()}`} section="Evidence display">
            <EvidenceDisplay metaEvidence={metaEvidence} chainId={chain.id} found={found} />
          </SectionBoundary>
        )}
      </Card>
    </section>
  );
}

/**
 * The dispute summary (spec 5.6): title, markdown description, parties, the arbitrable-app link, the meta-evidence's
 * attachment and the evidence display. It renders from the meta-evidence alone, before the rest of the view settles
 * (S-4); a failed load degrades this section only and Retry loads the meta-evidence again (D-36).
 */
export function DisputeSummary({ dispute, chain }: CaseSectionProps) {
  const client = useQueryClient();
  if (existingView(dispute) === null) return null;
  const found = foundLookup(dispute);
  const retry =
    found === undefined
      ? undefined
      : () => {
          void client.invalidateQueries({ queryKey: queryKeys.metaEvidence(dispute.chainId, dispute.disputeId, found.binding.arbitrated) });
        };
  return (
    <SectionContent data={summaryData(dispute.metaEvidence)} section="Dispute summary" loading={<SectionSkeleton variant="card" lines={5} />} onRetry={retry}>
      {(metaEvidence) => <SummaryCard metaEvidence={metaEvidence} dispute={dispute} chain={chain} found={found} />}
    </SectionContent>
  );
}
