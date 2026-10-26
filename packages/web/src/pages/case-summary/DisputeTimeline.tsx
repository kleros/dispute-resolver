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
 * When a period ends while the page is open, the bullets, the current bullet's halo, their numbers and the titles ease
 * between the current and the other steps' colours.
 */
const STEP_COLOUR_MOTION =
  "[&_[aria-hidden]>*]:transition-[color,background-color,border-color,fill,box-shadow] [&_[aria-hidden]>*]:duration-(--tabs-dur) [&_[aria-hidden]>*]:ease-(--tabs-ease) [&_[aria-hidden]>*]:motion-reduce:transition-none [&_[aria-hidden]_span]:transition-colors [&_[aria-hidden]_span]:duration-(--tabs-dur) [&_[aria-hidden]_span]:ease-(--tabs-ease) [&_[aria-hidden]_span]:motion-reduce:transition-none [&_h2]:transition-colors [&_h2]:duration-(--tabs-dur) [&_h2]:ease-(--tabs-ease) [&_h2]:motion-reduce:transition-none";

const STATE_TEXT =
  "[&_small]:text-sm [&_small]:leading-5 [&_li[aria-current]_small+small]:text-base [&_li[aria-current]_small+small]:leading-5 [&_li[aria-current]_small+small]:font-semibold [&_li[aria-current]_small+small]:text-klerosUIComponentsPrimaryText [&_li[aria-current]_small+small]:tabular-nums";

/** Upcoming rings and numbers take the band's edge colour: the library's Stroke all but vanishes on the band. */
const BULLETS =
  "[&_li[aria-disabled]_[aria-hidden]>div:first-child]:border-(--dr-record-edge) [&_li[aria-disabled]_[aria-hidden]_span]:text-klerosUIComponentsSecondaryText [&_li[aria-current]_[aria-hidden]>div:first-child]:shadow-[0_0_0_4px_color-mix(in_srgb,var(--klerosUIComponentsPrimaryBlue)_22%,transparent)]";

/**
 * From lg the library moves each step's text beside its bullet (`lg:static`, `lg:ml-2`, `lg:translate-x-0`, `lg:flex-col`),
 * so the connector starts after the widest text. These keep its own below-lg centring under the bullet, as a block so
 * "Ends in" and the countdown share a line, and `w-max` so the last step's 24 px box does not wrap the text. Selectors from
 * the list outrank the library's single-class utilities at every width. The labels are out of flow: the bottom padding
 * holds their two lines, the side padding keeps the first and last inside the band.
 */
const ROW_LABELS =
  "w-full px-18 pb-14 [&>li>div:last-child]:absolute [&>li>div:last-child]:top-8 [&>li>div:last-child]:left-0 [&>li>div:last-child]:ml-0 [&>li>div:last-child]:block [&>li>div:last-child]:w-max [&>li>div:last-child]:translate-x-[calc(-50%+12px)]";

/**
 * The connector is each step's `::after`. Every `after:` utility creates that box, on the last step too, so its size is
 * set on the steps before the last only, or the last bullet would move in. Each connector is two 1 px borders on the
 * bullets' middle, the second transparent until its step is done: a period ending changes colours only, so the line
 * thickens as it eases.
 */
const ROW_CONNECTORS =
  "[&>li:not(:last-child)]:after:mx-2 [&>li:not(:last-child)]:after:my-[11px] [&>li:not(:last-child)]:after:border-b [&>li:not([aria-current]):not([aria-disabled])]:after:border-b-klerosUIComponentsPrimaryBlue [&>li[aria-current]]:after:border-t-(--dr-record-edge) [&>li[aria-current]]:after:border-b-transparent [&>li[aria-disabled]]:after:border-t-(--dr-record-edge) [&>li[aria-disabled]]:after:border-b-transparent [&_li]:after:transition-colors [&_li]:after:duration-(--tabs-dur) [&_li]:after:ease-(--tabs-ease) [&_li]:after:motion-reduce:transition-none";

/**
 * One row per period: the library fits each step to its text (`w-fit`) and stacks its states (`flex-col`). Full width with
 * its text as a baseline row, the name sits left and the state right, inline; a state too long for the row wraps under
 * the name, still on the right. The list stops at 28rem: wider, on a tablet, a state sits too far from its name to read as
 * its value.
 */
const LIST_ROWS =
  "max-w-md [&_li]:w-full [&_li>div:last-child]:flex [&_li>div:last-child]:grow [&_li>div:last-child]:flex-wrap [&_li>div:last-child]:items-baseline [&_li>div:last-child]:justify-between [&_li>div:last-child]:gap-x-3 [&_li>div:last-child>div]:ml-auto [&_li>div:last-child>div]:block [&_li[aria-current]_h2]:text-base [&_li[aria-current]_h2]:leading-5";

/** Two 1 px borders as in the row, the second transparent until its step is done. */
const LIST_CONNECTORS =
  "[&_[aria-hidden]>*+*]:min-h-4 [&_[aria-hidden]>*+*]:border-r [&_li:not([aria-current]):not([aria-disabled])_[aria-hidden]>*+*]:border-r-klerosUIComponentsPrimaryBlue [&_li[aria-current]_[aria-hidden]>*+*]:border-l-(--dr-record-edge) [&_li[aria-current]_[aria-hidden]>*+*]:border-r-transparent [&_li[aria-disabled]_[aria-hidden]>*+*]:border-l-(--dr-record-edge) [&_li[aria-disabled]_[aria-hidden]>*+*]:border-r-transparent";

export const TIMELINE_V = [LIST_ROWS, LIST_CONNECTORS, STATE_TEXT, BULLETS, STEP_COLOUR_MOTION].join(" ");

export const TIMELINE_H = [ROW_LABELS, ROW_CONNECTORS, STATE_TEXT, BULLETS, STEP_COLOUR_MOTION].join(" ");

/**
 * "Concluded" for a past period, the countdown for the current one, the bare duration of an upcoming one. The countdown is
 * its own subitem after "Ends in " so the class strings can give it the fact size alone. A step without a state gets no
 * subitems at all: the library would still render and announce an empty one.
 */
function stateLines(column: TimelineColumn, now: number): string[] | undefined {
  switch (column.state) {
    case "concluded":
      return ["Concluded"];
    case "current":
      if (column.deadline === null) return undefined;
      return ["Ends in ", Number.isFinite(column.deadline) ? formatDuration(column.deadline - now) : "Unknown"];
    case "upcoming":
      return column.durationSeconds === null ? undefined : [formatDuration(column.durationSeconds)];
  }
}

/**
 * Where five steps get the row: narrower, five centred labels with a countdown sit too close together, so a hidden-vote
 * court keeps the list until here.
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
  // The library hard-codes its list's name to the orientation alone, so the section carries what the steps are.
  return (
    <section aria-label="Dispute timeline">
      <Steps items={items} currentItemIndex={columns.findIndex((column) => column.state === "current")} horizontal={wide} className={wide ? TIMELINE_H : TIMELINE_V} />
    </section>
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
