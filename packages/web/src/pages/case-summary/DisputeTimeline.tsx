import type { TimelineColumn, TimelineColumnName } from "@dispute-resolver/core";
import { Steps } from "@kleros/ui-components-library";
import { LG_MEDIA_QUERY, SectionSkeleton, formatDuration, useMediaQuery, useNowSeconds } from "../../ui";
import type { CaseSectionProps } from "../../data";
import { existingView, viewField } from "./caseState";
import { SectionContent } from "./SectionContent";

const COLUMN_LABELS: Readonly<Record<TimelineColumnName, string>> = {
  evidence: "Evidence",
  commit: "Commit",
  vote: "Voting",
  appeal: "Appeal",
  execution: "Execution",
};

/**
 * When a period ends while the page is open, the bullets, their numbers and the titles ease between the current and the
 * other steps' colours.
 */
const STEP_COLOUR_MOTION =
  "[&_[aria-hidden]>*]:transition-colors [&_[aria-hidden]>*]:duration-(--tabs-dur) [&_[aria-hidden]>*]:ease-(--tabs-ease) [&_[aria-hidden]>*]:motion-reduce:transition-none [&_[aria-hidden]_span]:transition-colors [&_[aria-hidden]_span]:duration-(--tabs-dur) [&_[aria-hidden]_span]:ease-(--tabs-ease) [&_[aria-hidden]_span]:motion-reduce:transition-none [&_h2]:transition-colors [&_h2]:duration-(--tabs-dur) [&_h2]:ease-(--tabs-ease) [&_h2]:motion-reduce:transition-none";

export const TIMELINE_V = `[&_small]:text-sm [&_small]:leading-5 [&_li[aria-current]_small+small]:text-xl [&_li[aria-current]_small+small]:leading-7 [&_li[aria-current]_small+small]:font-semibold [&_li[aria-current]_small+small]:text-klerosUIComponentsPrimaryText [&_li[aria-current]_small+small]:tabular-nums [&_li[aria-disabled]_[aria-hidden]>div:first-child]:border-(--dr-record-edge) [&_li[aria-disabled]_[aria-hidden]_span]:text-klerosUIComponentsSecondaryText [&_[aria-hidden]>*+*]:min-h-6 [&_div>li>div:last-child]:pb-4 [&_li[aria-current]_h2]:text-base [&_li[aria-current]_h2]:leading-5 ${STEP_COLOUR_MOTION}`;

export const TIMELINE_H = `w-full [&_small]:text-sm [&_small]:leading-5 [&_li[aria-current]_small+small]:text-xl [&_li[aria-current]_small+small]:leading-7 [&_li[aria-current]_small+small]:font-semibold [&_li[aria-current]_small+small]:text-klerosUIComponentsPrimaryText [&_li[aria-current]_small+small]:tabular-nums [&_li[aria-disabled]_[aria-hidden]>div:first-child]:border-(--dr-record-edge) [&_li[aria-disabled]_[aria-hidden]_span]:text-klerosUIComponentsSecondaryText [&_li]:after:transition-colors [&_li]:after:duration-(--tabs-dur) [&_li]:after:ease-(--tabs-ease) [&_li]:after:motion-reduce:transition-none ${STEP_COLOUR_MOTION}`;

/**
 * "Concluded" for a past period, the countdown for the current one, the duration of an upcoming one. The countdown is its
 * own line after "Ends in " so the class strings can give it the fact size alone. A step without a state gets no lines at
 * all: the library would still render and announce an empty one.
 */
function stateLines(column: TimelineColumn, now: number): string[] | undefined {
  switch (column.state) {
    case "concluded":
      return ["Concluded"];
    case "current":
      if (column.deadline === null) return undefined;
      return ["Ends in ", Number.isFinite(column.deadline) ? formatDuration(column.deadline - now) : "Unknown"];
    case "upcoming":
      return column.durationSeconds === null ? undefined : [`Lasts ${formatDuration(column.durationSeconds)}`];
  }
}

/**
 * Where five steps fit in one horizontal row: from lg up to about 1060 px, the band's inner width is short of five steps'
 * titles, countdown and connectors, so the countdown and the durations would wrap and the connectors collapse.
 */
export const FIVE_STEPS_MEDIA_QUERY = "(min-width: 67.5rem)";

/**
 * One `Steps` at a time, so the countdown is rendered once: vertical until the row fits, horizontal from then on. Four
 * steps fit from lg; five need the wider query.
 */
function TimelineSteps({ columns }: { readonly columns: readonly TimelineColumn[] }) {
  const now = useNowSeconds();
  const fourFit = useMediaQuery(LG_MEDIA_QUERY);
  const fiveFit = useMediaQuery(FIVE_STEPS_MEDIA_QUERY);
  const wide = columns.length > 4 ? fiveFit : fourFit;
  const items = columns.map((column) => ({ title: COLUMN_LABELS[column.name], subitems: stateLines(column, now) }));
  return (
    <div role="group" aria-label="Dispute timeline">
      <Steps items={items} currentItemIndex={columns.findIndex((column) => column.state === "current")} horizontal={wide} className={wide ? TIMELINE_H : TIMELINE_V} />
    </div>
  );
}

/**
 * Every period the dispute passes through, the current one counting down on the shared clock. It needs the dispute's court,
 * so a court that failed to load degrades this section only.
 */
export function DisputeTimeline({ dispute }: CaseSectionProps) {
  const view = existingView(dispute);
  if (view === null) return null;
  return (
    <SectionContent data={viewField(view, (value) => value.timeline)} section="Timeline" loading={<SectionSkeleton variant="text" lines={2} />}>
      {(timeline, reveal) => (
        <div className={["border-t border-(--dr-record-edge) pt-6", reveal].filter(Boolean).join(" ")}>
          <TimelineSteps columns={timeline.columns} />
        </div>
      )}
    </SectionContent>
  );
}
