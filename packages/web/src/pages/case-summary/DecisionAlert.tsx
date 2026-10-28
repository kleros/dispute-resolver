import type { Decision } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useId } from "react";
import { FACT_LEAD, SectionSkeleton } from "../../ui";
import { foundLookup, useCaseRefresh, type CaseSectionProps } from "../../data";
import { existingView } from "./caseState";
import { decisionLines, executionUnread } from "./decisionCopy";
import { SectionContent } from "./SectionContent";
import { TimelineBullet } from "./TimelineBullet";

type ShownDecision = Exclude<Decision, { kind: "none" }>;

function shownRuling(decision: ShownDecision): string {
  return decision.kind === "winner" ? decision.winner.rulingText : decision.jury.rulingText;
}

interface DecisionPanelProps {
  readonly decision: Decision;
  readonly className: string | undefined;
  readonly onRetry: () => void;
}

function DecisionPanel({ decision, className, onRetry }: DecisionPanelProps) {
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
        <TimelineBullet state={decision.kind === "jury-decision" ? "current" : "concluded"} />
      </span>
      <h2 id={headingId} className="text-base font-semibold text-klerosUIComponentsPrimaryText">
        {decision.kind === "winner" ? "Winner" : "Jury decision"}
      </h2>
      <p className={`${FACT_LEAD} [overflow-wrap:anywhere] empty:hidden`}>{shownRuling(decision)}</p>
      {decisionLines(decision).map((line) => (
        <p key={line} className="col-start-2 text-sm [overflow-wrap:anywhere] text-klerosUIComponentsSecondaryText">
          {line}
        </p>
      ))}
      {executionUnread(decision) ? (
        <Button
          text="Retry"
          aria-label="Retry reading the executed ruling"
          variant="secondary"
          small
          className="col-start-2 mt-2 self-start justify-self-start"
          onPress={onRetry}
        />
      ) : null}
    </section>
  );
}

/**
 * The text waits for the settled decision so it never flips from fallback text to the meta-evidence's options; a failed
 * read degrades this section only.
 */
export function DecisionAlert({ dispute }: CaseSectionProps) {
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  if (existingView(dispute) === null) return null;
  const period = foundLookup(dispute)?.dispute.period;
  const decided = period === 3 || period === 4;
  const retry = () => {
    void refresh("appeal");
  };
  return (
    <SectionContent data={dispute.decision} section="Decision" loading={decided ? <SectionSkeleton variant="card" lines={1} /> : null} onRetry={retry}>
      {(decision, reveal) => <DecisionPanel decision={decision} className={reveal} onRetry={retry} />}
    </SectionContent>
  );
}
