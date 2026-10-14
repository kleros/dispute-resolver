import type { Decision } from "@dispute-resolver/core";
import { useId } from "react";
import { decisionAttributes, testId } from "../../parity";
import { SectionSkeleton } from "../../ui";
import type { CaseSectionProps } from "../../data";
import { existingView, foundLookup, viewField } from "./caseState";
import { SectionContent } from "./SectionContent";

type ShownDecision = Exclude<Decision, { kind: "none" }>;

/** The explanation under the ruling (spec 5.9). */
function explanation(decision: ShownDecision): string {
  if (decision.kind === "winner") return decision.wonBy === "default" ? "Won by default" : "Won by jury decision";
  const appeal = "This decision can be appealed within the appeal period.";
  return decision.appealHint ? `${appeal} Go to the arbitrable application to appeal this ruling.` : appeal;
}

function DecisionPanel({ decision }: { readonly decision: Decision }) {
  const headingId = useId();
  const attributes = decisionAttributes({ kind: decision.kind, wonBy: decision.kind === "winner" ? decision.wonBy : null });
  // Periods 0 to 2 show no decision; the hidden element still reports `none` to the parity snapshot (04 §1).
  if (decision.kind === "none") return <div {...attributes} hidden />;
  return (
    <section
      {...attributes}
      aria-labelledby={headingId}
      className="flex flex-col gap-1 rounded-base border border-klerosUIComponentsPrimaryBlue bg-klerosUIComponentsWhiteBackground px-4 py-4 shadow-default lg:px-8 lg:py-5"
    >
      <h2 id={headingId} className="text-base font-semibold text-klerosUIComponentsPrimaryBlue">
        {decision.kind === "winner" ? "Winner" : "Jury decision"}
      </h2>
      <p {...testId("case-decision-ruling")} className="text-xl font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]">
        {decision.rulingText}
      </p>
      <p className="text-sm text-klerosUIComponentsSecondaryText">{explanation(decision)}</p>
    </section>
  );
}

/**
 * The decision (spec 5.9): the jury decision in the appeal period, the winner in execution, nothing before. Its text
 * waits for the settled view so it never flips from fallback text to the meta-evidence's options (S-4); a failed read
 * degrades this section only (D-36).
 */
export function DecisionAlert({ dispute }: CaseSectionProps) {
  const view = existingView(dispute);
  if (view === null) return null;
  const period = foundLookup(dispute)?.dispute.period;
  const decided = period === 3 || period === 4;
  return (
    <SectionContent data={viewField(view, (value) => value.decision)} section="Decision" loading={decided ? <SectionSkeleton variant="text" lines={2} /> : null}>
      {(decision) => <DecisionPanel decision={decision} />}
    </SectionContent>
  );
}
