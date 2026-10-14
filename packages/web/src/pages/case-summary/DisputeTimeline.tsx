import type { TimelineColumn, TimelineColumnName } from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import { timelineColumnAttributes } from "../../parity";
import { Countdown, SectionSkeleton, formatDuration } from "../../ui";
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

const BULLET_CLASS: Readonly<Record<TimelineColumn["state"], string>> = {
  concluded: "bg-klerosUIComponentsPrimaryBlue",
  current: "border-2 border-klerosUIComponentsPrimaryBlue bg-klerosUIComponentsWhiteBackground",
  upcoming: "border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground",
};

function Bullet({ state }: { readonly state: TimelineColumn["state"] }) {
  return (
    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${BULLET_CLASS[state]}`}>
      {state === "concluded" ? (
        <svg viewBox="0 0 16 16" className="size-3.5 fill-none stroke-klerosUIComponentsWhiteBackground" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      ) : null}
      {state === "current" ? <span className="size-2.5 rounded-full bg-klerosUIComponentsPrimaryBlue" /> : null}
    </span>
  );
}

/** "Concluded" for a past period, the countdown for the current one, the duration of an upcoming one (spec 5.7). */
function ColumnDetail({ column }: { readonly column: TimelineColumn }) {
  switch (column.state) {
    case "concluded":
      return <span>Concluded</span>;
    case "current":
      return column.deadline === null ? null : (
        <span className="text-klerosUIComponentsPrimaryText">
          {"Ends in "}
          <Countdown target={column.deadline} />
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
              <Bullet state={column.state} />
              {last ? null : <span className={`my-1 min-h-4 w-px grow lg:mx-2 lg:my-0 lg:h-px lg:min-h-0 lg:w-auto ${connector}`} />}
            </div>
            <div className={`flex min-w-0 flex-col gap-0.5 lg:pr-4 ${last ? "" : "pb-5 lg:pb-0"}`}>
              <p className={`text-sm font-semibold leading-6 ${current ? "text-klerosUIComponentsPrimaryText" : "text-klerosUIComponentsSecondaryText"}`}>
                {COLUMN_LABELS[column.name]}
              </p>
              <span className="text-sm text-klerosUIComponentsSecondaryText">
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
    <SectionContent data={viewField(view, (value) => value.timeline)} section="Timeline" loading={<SectionSkeleton variant="card" lines={1} />}>
      {(timeline) => (
        <Card round className="h-auto w-full p-4 lg:px-8 lg:py-6">
          <TimelineColumns columns={timeline.columns} />
        </Card>
      )}
    </SectionContent>
  );
}
