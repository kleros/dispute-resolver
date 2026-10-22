import { useId, type ReactNode } from "react";
import { FACT_SMALL, LABEL, PAGE_TITLE, PeriodBadge, useRevealIn } from "../../ui";
import type { CaseSectionProps } from "../../data";
import { existingView, foundLookup } from "./caseState";
import { ViewDetail } from "./ViewDetail";

function Detail({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <dt className={LABEL}>{label}</dt>
      <dd className={`${FACT_SMALL} min-w-0 [overflow-wrap:anywhere]`}>{children}</dd>
    </div>
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h1 id={headingId} className={`${PAGE_TITLE} min-w-0 [overflow-wrap:anywhere]`}>
            {"Dispute #"}
            <span className="tabular-nums">{dispute.disputeId.toString()}</span>
          </h1>
          {found === undefined ? (
            <div role="status" aria-busy="true" aria-live="polite">
              <span className="sr-only">Loading…</span>
              <span aria-hidden="true" className="block h-9 w-28 animate-loading rounded-full bg-klerosUIComponentsStroke" />
            </div>
          ) : (
            <PeriodBadge variant="pill" size="lg" period={found.dispute.period} className={pillReveal} />
          )}
        </div>
        <dl className="grid grid-cols-1 gap-4 border-t border-(--dr-record-edge) pt-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-(--dr-record-edge)">
          <Detail label="Network">{chain.name}</Detail>
          <Detail label="Court">
            <ViewDetail view={view} pick={(value) => value.court}>
              {(court) => court.name ?? <span className="font-normal text-klerosUIComponentsSecondaryText">{`Court #${court.id.toString()} (name unavailable)`}</span>}
            </ViewDetail>
          </Detail>
          <Detail label="Number of votes">
            <ViewDetail view={view} pick={(value) => value.numberOfVotes}>
              {(votes) => <span className="tabular-nums">{votes}</span>}
            </ViewDetail>
          </Detail>
        </dl>
      </div>
    </section>
  );
}
