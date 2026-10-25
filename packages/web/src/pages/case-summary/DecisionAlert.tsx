import type { Decision } from "@dispute-resolver/core";
import { useId } from "react";
import { FACT_LEAD, SectionSkeleton } from "../../ui";
import { foundLookup, type CaseSectionProps } from "../../data";
import { existingView, viewField } from "./caseState";
import { SectionContent } from "./SectionContent";
import { TimelineBullet } from "./TimelineBullet";

type ShownDecision = Exclude<Decision, { kind: "none" }>;

function explanation(decision: ShownDecision): string {
  if (decision.kind === "winner") return decision.wonBy === "default" ? "Won by default" : "Won by jury decision";
  const appeal = "This decision can be appealed within the appeal period.";
  return decision.appealHint ? `${appeal} Go to the arbitrable application to appeal this ruling.` : appeal;
}

function DecisionPanel({ decision, className }: { readonly decision: Decision; readonly className: string | undefined }) {
  const headingId = useId();
  if (decision.kind === "none") return null;
  return (
    <section
      aria-labelledby={headingId}
      className={[
        "grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-4 gap-y-1 rounded-[18px] border-2 border-klerosUIComponentsPrimaryBlue bg-klerosUIComponentsMediumBlue px-4 py-4 lg:px-8 lg:py-6",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span aria-hidden="true" className="row-span-2 mt-0.5">
        <TimelineBullet state={decision.kind === "winner" ? "concluded" : "current"} />
      </span>
      <h2 id={headingId} className="text-base font-semibold text-klerosUIComponentsPrimaryText">
        {decision.kind === "winner" ? "Winner" : "Jury decision"}
      </h2>
      <p className={`${FACT_LEAD} [overflow-wrap:anywhere] empty:hidden`}>{decision.rulingText}</p>
      <p className="col-start-2 text-sm text-klerosUIComponentsSecondaryText">{explanation(decision)}</p>
    </section>
  );
}

/**
 * The text waits for the settled view so it never flips from fallback text to the meta-evidence's options; a failed read
 * degrades this section only.
 */
export function DecisionAlert({ dispute }: CaseSectionProps) {
  const view = existingView(dispute);
  if (view === null) return null;
  const period = foundLookup(dispute)?.dispute.period;
  const decided = period === 3 || period === 4;
  return (
    <SectionContent data={viewField(view, (value) => value.decision)} section="Decision" loading={decided ? <SectionSkeleton variant="card" lines={1} /> : null}>
      {(decision, reveal) => <DecisionPanel decision={decision} className={reveal} />}
    </SectionContent>
  );
}
