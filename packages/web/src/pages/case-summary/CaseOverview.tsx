import { Card } from "@kleros/ui-components-library";
import { useId, type ReactNode } from "react";
import { testId, votesAttributes } from "../../parity";
import { PeriodBadge, SectionSkeleton } from "../../ui";
import type { CaseSectionProps } from "../../data";
import { existingView, foundLookup } from "./caseState";
import { ViewDetail } from "./ViewDetail";

function Detail({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-sm text-klerosUIComponentsSecondaryText">{label}</dt>
      <dd className="min-w-0 font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/**
 * The case header card with the info row (spec 5.8, ARCHITECTURE.md 11.5): the dispute ID and its period as soon as the
 * lookup has found it (S-4), the network, and the court and first-round vote count once the view has settled, each
 * degrading on its own (D-36).
 */
export function CaseOverview({ dispute, chain }: CaseSectionProps) {
  const headingId = useId();
  const view = existingView(dispute);
  if (view === null) return null;
  const found = foundLookup(dispute);
  return (
    <section aria-labelledby={headingId}>
      <Card round className="flex h-auto w-full flex-col gap-4 p-4 lg:px-8 lg:py-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h1 id={headingId} className="min-w-0 text-2xl font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">
            {`Dispute #${dispute.disputeId.toString()}`}
          </h1>
          {found === undefined ? (
            <div className="w-24">
              <SectionSkeleton variant="text" lines={1} />
            </div>
          ) : (
            <PeriodBadge period={found.dispute.period} />
          )}
        </div>
        <dl className="grid grid-cols-1 gap-4 border-t border-klerosUIComponentsStroke pt-4 sm:grid-cols-3">
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
              {(votes) => <span {...votesAttributes(votes)}>{votes}</span>}
            </ViewDetail>
          </Detail>
        </dl>
      </Card>
    </section>
  );
}
