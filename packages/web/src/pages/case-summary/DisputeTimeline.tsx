import type { TimelineColumn, TimelineColumnName } from "@dispute-resolver/core";
import { Countdown, FACT, LABEL, SectionSkeleton, formatDuration } from "../../ui";
import type { CaseSectionProps } from "../../data";
import { existingView, viewField } from "./caseState";
import { SectionContent } from "./SectionContent";
import { TimelineBullet } from "./TimelineBullet";

const COLUMN_LABELS: Readonly<Record<TimelineColumnName, string>> = {
  evidence: "Evidence",
  commit: "Commit",
  vote: "Voting",
  appeal: "Appeal",
  execution: "Execution",
};

const OTHER_DETAIL = "text-sm text-klerosUIComponentsSecondaryText max-sm:sr-only";

/**
 * Below lg the columns are too narrow for a countdown, so the current one leaves its column for a centred line in the
 * room the list reserves under the rail; from lg it sits in its own column.
 */
const CURRENT_DETAIL = "flex items-baseline justify-center gap-2 max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 lg:static lg:flex-col lg:items-center lg:gap-0.5";

/** "Concluded" for a past period, the countdown for the current one, the duration of an upcoming one. */
function ColumnDetail({ column }: { readonly column: TimelineColumn }) {
  switch (column.state) {
    case "concluded":
      return <span className={OTHER_DETAIL}>Concluded</span>;
    case "current":
      return column.deadline === null ? null : (
        <span className={CURRENT_DETAIL}>
          <span className={LABEL}>{"Ends in "}</span>
          <Countdown target={column.deadline} className={FACT} />
        </span>
      );
    case "upcoming":
      return column.durationSeconds === null ? null : <span className={OTHER_DETAIL}>{`Lasts ${formatDuration(column.durationSeconds)}`}</span>;
  }
}

/** The line leaving a step, in the concluded colour once the step is over. */
function lineAfter(column: TimelineColumn): string {
  return column.state === "concluded" ? "bg-klerosUIComponentsPrimaryBlue" : "bg-klerosUIComponentsStroke";
}

/**
 * Every period as one equal column, the line drawn in halves around each bullet so the first and the last bullets sit as
 * far from the edges as the others from each other.
 */
function TimelineColumns({ columns }: { readonly columns: readonly TimelineColumn[] }) {
  const counting = columns.some((column) => column.state === "current" && column.deadline !== null);
  return (
    <ol aria-label="Dispute timeline" className={`relative grid auto-cols-fr grid-flow-col max-lg:-mx-2 ${counting ? "max-lg:pb-14" : ""}`}>
      {columns.map((column, index) => {
        const previous = columns[index - 1];
        const last = index === columns.length - 1;
        const current = column.state === "current";
        return (
          <li key={column.name} aria-current={current ? "step" : undefined} className="flex min-w-0 flex-col items-center gap-2 text-center">
            <div aria-hidden="true" className="flex w-full items-center">
              <span className={`h-px flex-1 ${previous === undefined ? "invisible" : lineAfter(previous)}`} />
              <TimelineBullet state={column.state} />
              <span className={`h-px flex-1 ${last ? "invisible" : lineAfter(column)}`} />
            </div>
            <p className={`text-sm leading-6 font-semibold ${current ? "text-klerosUIComponentsPrimaryText" : "text-klerosUIComponentsSecondaryText"}`}>
              {COLUMN_LABELS[column.name]}
            </p>
            <ColumnDetail column={column} />
          </li>
        );
      })}
    </ol>
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
      {(timeline) => (
        <div className="border-t border-(--dr-record-edge) pt-6">
          <TimelineColumns columns={timeline.columns} />
        </div>
      )}
    </SectionContent>
  );
}
