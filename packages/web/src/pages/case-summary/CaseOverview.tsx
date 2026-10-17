import { useId, type ReactNode } from "react";
import { testId, votesAttributes } from "../../parity";
import { FACT_SMALL, LABEL, PAGE_TITLE, PeriodBadge, RECORD_BAND } from "../../ui";
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
 * The case header card with the info row (spec 5.8, ARCHITECTURE.md 11.5): the dispute ID and its period as soon as the
 * lookup has found it (P-20), the network, and the court and first-round vote count once the view has settled, each
 * degrading on its own (D-36).
 */
export function CaseOverview({ dispute, chain }: CaseSectionProps) {
  const headingId = useId();
  const view = existingView(dispute);
  if (view === null) return null;
  const found = foundLookup(dispute);
  return (
    <section aria-labelledby={headingId}>
      <div className={`${RECORD_BAND} flex flex-col gap-4 p-4 lg:px-8 lg:py-6`}>
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
            <PeriodBadge variant="pill" size="lg" period={found.dispute.period} />
          )}
        </div>
        <dl className="grid grid-cols-1 gap-4 border-t border-(--dr-record-edge) pt-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-(--dr-record-edge)">
          <Detail label="Network">{chain.name}</Detail>
          <Detail label="Court">
            <ViewDetail view={view} pick={(value) => value.court}>
              {(court) =>
                court.name === null ? (
                  <span className="font-normal text-klerosUIComponentsSecondaryText">{`Court #${court.id.toString()} (name unavailable)`}</span>
                ) : (
                  <span {...testId("case-court")}>{court.name}</span>
                )
              }
            </ViewDetail>
          </Detail>
          <Detail label="Number of votes">
            <ViewDetail view={view} pick={(value) => value.numberOfVotes}>
              {(votes) => (
                <span {...votesAttributes(votes)} className="tabular-nums">
                  {votes}
                </span>
              )}
            </ViewDetail>
          </Detail>
        </dl>
      </div>
    </section>
  );
}
