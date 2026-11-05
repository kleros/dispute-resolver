import { resolveArbitrableAppLink, toAttachmentLink, type MetaEvidence } from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import { useId } from "react";
import { APP_CONFIG } from "../../env";
import { Attachment, ExternalLink, SafeMarkdown } from "../../safe-content";
import { EYEBROW, SectionBoundary, SectionSkeleton } from "../../ui";
import { foundLookup, metaEvidenceSection, useCoreDeps, type CaseSectionProps, type FoundLookup } from "../../data";
import { existingView } from "./caseState";
import { EvidenceDisplay } from "./EvidenceDisplay";
import { Parties } from "./Parties";
import { SectionContent } from "./SectionContent";

const NO_META_EVIDENCE = "This dispute has no meta-evidence, so its title and description cannot be shown.";

const APP_LINK_CLASS = "inline-flex items-center gap-1.5 rounded-base font-semibold text-klerosUIComponentsPrimaryBlue underline-offset-2 [overflow-wrap:anywhere] hover:underline";

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h4v4M13 3 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

interface DisplayRetry {
  readonly key: string;
  readonly onRetry: () => void;
}

interface SummaryCardProps {
  readonly metaEvidence: MetaEvidence;
  readonly chain: CaseSectionProps["chain"];
  readonly found: FoundLookup | undefined;
  readonly displayRetry: DisplayRetry;
  /** Reveals the header, the description and the parties; the card and the evidence display stay still. */
  readonly reveal: string | undefined;
}

function SummaryCard({ metaEvidence, chain, found, displayRetry, reveal }: SummaryCardProps) {
  const headingId = useId();
  const { gateway } = useCoreDeps();
  const appLink = resolveArbitrableAppLink(metaEvidence.arbitrableInterfaceURI, APP_CONFIG.selfHosts);
  const attachment = toAttachmentLink(metaEvidence.fileURI, gateway);
  return (
    <section aria-labelledby={headingId}>
      <Card round className="flex h-auto w-full flex-col p-0">
        <div className="flex min-w-0 flex-col gap-6 p-4 lg:px-8 lg:py-6">
          <header className={["flex flex-col gap-1", reveal].filter(Boolean).join(" ")}>
            <p className={EYEBROW}>Interact with the dispute</p>
            <h2 id={headingId} className="text-xl font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">
              {metaEvidence.title === "" ? <span className="text-klerosUIComponentsSecondaryText">Untitled dispute</span> : metaEvidence.title}
            </h2>
          </header>
          <SafeMarkdown source={metaEvidence.description} className={["[&_p]:leading-7", reveal].filter(Boolean).join(" ")} />
          {/* Without aliases the parties render nothing, and the empty wrapper must not add a gap. */}
          <div className={["empty:hidden", reveal].filter(Boolean).join(" ")}>
            <Parties aliases={metaEvidence.aliases} chain={chain} />
          </div>
          {found === undefined ? null : (
            <SectionBoundary key={displayRetry.key} section="Evidence display" onRetry={displayRetry.onRetry}>
              <EvidenceDisplay metaEvidence={metaEvidence} chainId={chain.id} found={found} />
            </SectionBoundary>
          )}
        </div>
        {appLink === null && attachment === null ? null : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-b-[17px] border-t border-klerosUIComponentsStroke bg-klerosUIComponentsLightBackground px-4 py-4 lg:px-8">
            {appLink === null ? null : (
              <ExternalLink href={appLink} className={APP_LINK_CLASS}>
                Go to the arbitrable application
                <ExternalIcon />
              </ExternalLink>
            )}
            <Attachment attachment={attachment} />
          </div>
        )}
      </Card>
    </section>
  );
}

interface DisputeSummaryProps extends CaseSectionProps {
  readonly displayRetry: DisplayRetry;
  readonly onRetry?: () => void;
}

/**
 * Renders from the meta-evidence alone, before the rest of the view settles. The evidence display has its own boundary,
 * whose Retry is the case page's `displayRetry`.
 */
export function DisputeSummary({ dispute, chain, displayRetry, onRetry }: DisputeSummaryProps) {
  if (existingView(dispute) === null) return null;
  const found = foundLookup(dispute);
  return (
    <SectionContent
      data={metaEvidenceSection(dispute.metaEvidence, NO_META_EVIDENCE)}
      section="Dispute summary"
      loading={<SectionSkeleton variant="card" lines={5} />}
      onRetry={onRetry}
    >
      {(metaEvidence, reveal) => <SummaryCard metaEvidence={metaEvidence} chain={chain} found={found} displayRetry={displayRetry} reveal={reveal} />}
    </SectionContent>
  );
}
