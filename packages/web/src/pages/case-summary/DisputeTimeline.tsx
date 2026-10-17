import type { TimelineColumn, TimelineColumnName } from "@dispute-resolver/core";
import { timelineColumnAttributes } from "../../parity";
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

/** "Concluded" for a past period, the countdown for the current one, the duration of an upcoming one (spec 5.7). */
function ColumnDetail({ column }: { readonly column: TimelineColumn }) {
  switch (column.state) {
    case "concluded":
      return <span>Concluded</span>;
    case "current":
      return column.deadline === null ? null : (
        <span className="flex flex-col gap-0.5">
          <span className={LABEL}>{"Ends in "}</span>
          <Countdown target={column.deadline} className={FACT} />
        </span>
      );
    case "upcoming":
      return column.durationSeconds === null ? null : <span>{`Lasts ${formatDuration(column.durationSeconds)}`}</span>;
  }
}

function TimelineColumns({ columns }: { readonly columns: readonly TimelineColumn[] }) {
  return (
    <ol aria-label="Dispute timeline" className="flex flex-col lg:flex-row">
      {columns.map((column, index) => {
        const last = index === columns.length - 1;
        const current = column.state === "current";
        const connector = column.state === "concluded" ? "bg-klerosUIComponentsPrimaryBlue" : "bg-klerosUIComponentsStroke";
        return (
          <li
            key={column.name}
            {...timelineColumnAttributes({ name: column.name, state: column.state })}
            aria-current={current ? "step" : undefined}
            className="flex min-w-0 gap-3 lg:flex-1 lg:flex-col lg:gap-2"
          >
            <div aria-hidden="true" className="flex flex-col items-center lg:flex-row">
              <TimelineBullet state={column.state} />
              {last ? null : <span className={`my-1 min-h-4 w-px grow lg:mx-2 lg:my-0 lg:h-px lg:min-h-0 lg:w-auto ${connector}`} />}
            </div>
            <div className={`flex min-w-0 flex-col gap-0.5 lg:pr-4 ${last ? "" : "pb-6 lg:pb-0"}`}>
              <p className={`font-semibold leading-6 ${current ? "text-base text-klerosUIComponentsPrimaryText" : "text-sm text-klerosUIComponentsSecondaryText"}`}>
                {COLUMN_LABELS[column.name]}
              </p>
              <span className={current ? "text-klerosUIComponentsPrimaryText" : "text-sm text-klerosUIComponentsSecondaryText"}>
                <ColumnDetail column={column} />
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The timeline (spec 5.7 with D-39): every period the dispute passes through, the current one counting down on the shared
 * clock. It needs the dispute's court, so a court that failed to load degrades this section only (D-36).
 */
export function DisputeTimeline({ dispute }: CaseSectionProps) {
  const view = existingView(dispute);
  if (view === null) return null;
  return (
    <SectionContent data={viewField(view, (value) => value.timeline)} section="Timeline" loading={<SectionSkeleton variant="text" lines={2} />}>
      {(timeline) => (
        <div className="px-2 py-2 lg:px-8">
          <TimelineColumns columns={timeline.columns} />
        </div>
      )}
    </SectionContent>
  );
}
