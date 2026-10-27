import { useId, type ReactNode } from "react";
import { FACT_SMALL, LABEL, PAGE_TITLE, PeriodBadge, useRevealIn } from "../../ui";
import { foundLookup, type CaseSectionProps } from "../../data";
import { existingView } from "./caseState";
import { DetailPlaceholder, ViewDetail } from "./ViewDetail";

function Detail({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <dt className={LABEL}>{label}</dt>
      <dd className={`${FACT_SMALL} min-w-0 [overflow-wrap:anywhere]`}>{children}</dd>
    </div>
  );
}

function PeriodPlaceholder() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <span aria-hidden="true" className="block h-9 w-28 animate-loading rounded-full bg-klerosUIComponentsStroke" />
    </div>
  );
}

interface OverviewLayoutProps {
  readonly headingId?: string;
  /** `null` while the typed text is no ID: a block of the heading's height stands in. */
  readonly disputeId: bigint | null;
  readonly period: ReactNode;
  readonly network: string;
  readonly court: ReactNode;
  readonly votes: ReactNode;
}

/** One layout for the found dispute and the search still waiting for its pause, so the band keeps its height between them. */
function OverviewLayout({ headingId, disputeId, period, network, court, votes }: OverviewLayoutProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {disputeId === null ? (
          <div aria-hidden="true" className="h-8 w-40 animate-loading rounded-base bg-klerosUIComponentsStroke lg:h-9" />
        ) : (
          <h1 id={headingId} className={`${PAGE_TITLE} min-w-0 [overflow-wrap:anywhere]`}>
            {"Dispute #"}
            <span className="tabular-nums">{disputeId.toString()}</span>
          </h1>
        )}
        {period}
      </div>
      <dl className="grid grid-cols-1 gap-4 border-t border-(--dr-record-edge) pt-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-(--dr-record-edge)">
        <Detail label="Network">{network}</Detail>
        <Detail label="Court">{court}</Detail>
        <Detail label="Number of votes">{votes}</Detail>
      </dl>
    </div>
  );
}

/** The overview of the ID still waiting for the search's pause, laid out as the lookup will show it. */
export function PendingOverview({ disputeId, chainName }: { readonly disputeId: bigint | null; readonly chainName: string }) {
  return (
    <section>
      <OverviewLayout disputeId={disputeId} period={<PeriodPlaceholder />} network={chainName} court={<DetailPlaceholder />} votes={<DetailPlaceholder />} />
    </section>
  );
}

/**
 * The dispute ID and its period show as soon as the lookup finds the dispute; the court and the first-round vote count
 * wait for the settled view, each degrading on its own.
 */
export function CaseOverview({ dispute, chain }: CaseSectionProps) {
  const headingId = useId();
  const found = foundLookup(dispute);
  const pillReveal = useRevealIn(found === undefined);
  const view = existingView(dispute);
  if (view === null) return null;
  return (
    <section aria-labelledby={headingId}>
      <OverviewLayout
        headingId={headingId}
        disputeId={dispute.disputeId}
        period={found === undefined ? <PeriodPlaceholder /> : <PeriodBadge size="lg" period={found.dispute.period} className={pillReveal} />}
        network={chain.name}
        court={
          <ViewDetail view={view} pick={(value) => value.court}>
            {(court) => court.name ?? <span className="font-normal text-klerosUIComponentsSecondaryText">{`Court #${court.id.toString()} (name unavailable)`}</span>}
          </ViewDetail>
        }
        votes={
          <ViewDetail view={view} pick={(value) => value.numberOfVotes}>
            {(votes) => <span className="tabular-nums">{votes}</span>}
          </ViewDetail>
        }
      />
    </section>
  );
}
