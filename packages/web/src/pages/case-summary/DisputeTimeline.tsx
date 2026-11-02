import { losingDeadline, type AppealPanel, type FundingTerms, type TimelineColumn, type TimelineColumnName } from "@dispute-resolver/core";
import { Steps } from "@kleros/ui-components-library";
import { LG_MEDIA_QUERY, SectionSkeleton, formatDuration, useMediaQuery, useNowSeconds } from "../../ui";
import type { CaseSectionProps, SectionData } from "../../data";
import { existingView, viewField } from "./caseState";
import { SectionContent } from "./SectionContent";

const COLUMN_LABELS: Readonly<Record<TimelineColumnName, string>> = {
  evidence: "Evidence",
  commit: "Commit",
  vote: "Voting",
  appeal: "Appeal",
  execution: "Execution",
};

const STEP_COLOUR_MOTION =
  "[&_[aria-hidden]>*]:transition-[color,background-color,border-color,fill,box-shadow] [&_[aria-hidden]>*]:duration-(--tabs-dur) [&_[aria-hidden]>*]:ease-(--tabs-ease) [&_[aria-hidden]>*]:motion-reduce:transition-none [&_[aria-hidden]_span]:transition-colors [&_[aria-hidden]_span]:duration-(--tabs-dur) [&_[aria-hidden]_span]:ease-(--tabs-ease) [&_[aria-hidden]_span]:motion-reduce:transition-none [&_h2]:transition-colors [&_h2]:duration-(--tabs-dur) [&_h2]:ease-(--tabs-ease) [&_h2]:motion-reduce:transition-none";

/**
 * Every line of the current step, the losing side's included, takes the value style. A lone "Ended" keeps it too: the
 * value then neither resizes nor moves when its countdown runs out, and it reads as the current step's state, not like a
 * past step's "Concluded".
 */
const STATE_TEXT =
  "[&_small]:text-sm [&_small]:leading-5 [&_li[aria-current]_small]:text-base [&_li[aria-current]_small]:leading-5 [&_li[aria-current]_small]:font-semibold [&_li[aria-current]_small]:text-klerosUIComponentsPrimaryText [&_li[aria-current]_small]:tabular-nums";

/** Upcoming rings and numbers take the band's edge colour: the library's Stroke all but vanishes on the band. */
const BULLETS =
  "[&_li[aria-disabled]_[aria-hidden]>div:first-child]:border-(--dr-record-edge) [&_li[aria-disabled]_[aria-hidden]_span]:text-klerosUIComponentsSecondaryText [&_li[aria-current]_[aria-hidden]>div:first-child]:shadow-[0_0_0_4px_color-mix(in_srgb,var(--klerosUIComponentsPrimaryBlue)_22%,transparent)]";

/**
 * From lg the library moves each step's text beside its bullet (`lg:static`, `lg:ml-2`, `lg:translate-x-0`, `lg:flex-col`),
 * so the connector starts after the widest text. These keep its own below-lg centring under the bullet, as a block so
 * the states are lines of text at the text's line pitch, and `w-max` so the last step's 24 px box does not wrap the
 * text. The empty block before the second subitem starts the losing side's line under the first. Selectors from the
 * list outrank the library's single-class utilities at every width. The labels are out of flow: the bottom padding
 * holds their lines, and the side padding keeps the first and last inside the band.
 */
const ROW_LABELS =
  "w-full px-18 [&>li>div:last-child]:absolute [&>li>div:last-child]:top-8 [&>li>div:last-child]:left-0 [&>li>div:last-child]:ml-0 [&>li>div:last-child]:block [&>li>div:last-child]:w-max [&>li>div:last-child]:translate-x-[calc(-50%+12px)] [&_li[aria-current]_small:nth-of-type(2)]:before:block";

/**
 * Two lines of state; the appeal step holds a third for its whole period, so nothing moves when the losing side's line
 * lands. The text inherits the root's 24 px line height, a strut the subitems' own leading cannot shrink, and three lines
 * at that pitch overhang the room: the appeal period sets the pitch to 22 px instead. The shorter line lifts the first
 * state line 1 px, which the title's margin gives back so it sits where it does in every other period. That margin
 * makes the three lines 1 px taller than the room, so the losing line starts 1 px up: the two lines' boxes then overlap
 * by that pixel, their glyphs stay well apart.
 */
const ROW_ROOM = "pb-14";
const ROW_ROOM_APPEAL = "pb-19 [&>li>div:last-child]:leading-5.5 [&>li>div:last-child>h2]:mb-px [&_li[aria-current]_small:nth-of-type(2)]:before:-mb-px";

/**
 * The connector is each step's `::after`. Every `after:` utility creates that box, on the last step too, so its size is
 * set on the steps before the last only, or the last bullet would move in. Each connector is two 1 px borders on the
 * bullets' middle, the second transparent until its step is done: a period ending changes colours only, so the line
 * thickens as it eases.
 */
const ROW_CONNECTORS =
  "[&>li:not(:last-child)]:after:mx-2 [&>li:not(:last-child)]:after:my-[11px] [&>li:not(:last-child)]:after:border-b [&>li:not([aria-current]):not([aria-disabled])]:after:border-b-klerosUIComponentsPrimaryBlue [&>li[aria-current]]:after:border-t-(--dr-record-edge) [&>li[aria-current]]:after:border-b-transparent [&>li[aria-disabled]]:after:border-t-(--dr-record-edge) [&>li[aria-disabled]]:after:border-b-transparent [&_li]:after:transition-colors [&_li]:after:duration-(--tabs-dur) [&_li]:after:ease-(--tabs-ease) [&_li]:after:motion-reduce:transition-none";

/**
 * The library fits each step to its text (`w-fit`) and stacks its states (`flex-col`); these make one full-width baseline
 * row per period, the name left and the state right.
 */
const LIST_ROWS =
  "[&_li]:w-full [&_li>div:last-child]:flex [&_li>div:last-child]:grow [&_li>div:last-child]:flex-wrap [&_li>div:last-child]:items-baseline [&_li>div:last-child]:justify-between [&_li>div:last-child]:gap-x-3 [&_li>div:last-child>div]:ml-auto [&_li>div:last-child>div]:block [&_li[aria-current]_h2]:text-base [&_li[aria-current]_h2]:leading-5";

/**
 * A current row with a losing line is a grid: the title and the countdown on the first row as in the flex row above, the
 * losing line alone on the second across both columns, right-aligned, so it ends where the countdown does. A row with one
 * line keeps the flex row. The states' own box steps aside (`contents`) so each subitem is a cell. A cell is a block
 * whose height is its line height, where the flex row's value is an inline box as tall as its font's 22 px: the lines
 * take that height as their line height, and the top padding puts the title and the countdown where the flex row has
 * them, so neither moves when the losing line lands. The bottom padding keeps a wrapped losing line off the next row.
 */
const LIST_CURRENT_GRID =
  "[&_li[aria-current]:has(small:nth-of-type(2))>div:last-child]:grid [&_li[aria-current]:has(small:nth-of-type(2))>div:last-child]:grid-cols-[1fr_auto] [&_li[aria-current]:has(small:nth-of-type(2))>div:last-child]:content-start [&_li[aria-current]:has(small:nth-of-type(2))>div:last-child]:pt-px [&_li[aria-current]:has(small:nth-of-type(2))>div:last-child]:pb-2 [&_li[aria-current]:has(small:nth-of-type(2))>div:last-child>div]:contents [&_li[aria-current]:has(small:nth-of-type(2))_small]:leading-5.5 [&_li[aria-current]:has(small:nth-of-type(2))_small:nth-of-type(2)]:col-span-full [&_li[aria-current]:has(small:nth-of-type(2))_small:nth-of-type(2)]:text-right";

const LIST_CONNECTORS =
  "[&_[aria-hidden]>*+*]:min-h-4 [&_[aria-hidden]>*+*]:border-r [&_li:not([aria-current]):not([aria-disabled])_[aria-hidden]>*+*]:border-r-klerosUIComponentsPrimaryBlue [&_li[aria-current]_[aria-hidden]>*+*]:border-l-(--dr-record-edge) [&_li[aria-current]_[aria-hidden]>*+*]:border-r-transparent [&_li[aria-disabled]_[aria-hidden]>*+*]:border-l-(--dr-record-edge) [&_li[aria-disabled]_[aria-hidden]>*+*]:border-r-transparent";

export const TIMELINE_V = [LIST_ROWS, LIST_CURRENT_GRID, LIST_CONNECTORS, STATE_TEXT, BULLETS, STEP_COLOUR_MOTION].join(" ");

function timelineRow(room: string): string {
  return [ROW_LABELS, room, ROW_CONNECTORS, STATE_TEXT, BULLETS, STEP_COLOUR_MOTION].join(" ");
}

export const TIMELINE_H = timelineRow(ROW_ROOM);

export const TIMELINE_H_APPEAL = timelineRow(ROW_ROOM_APPEAL);

function panelTerms(panel: SectionData<AppealPanel>): FundingTerms | undefined {
  if (panel.status !== "ready") return undefined;
  const { value } = panel;
  return value.kind === "crowdfunding" || value.kind === "handled-by-arbitrable" ? value.terms : undefined;
}

/** When funding closes for the rulings other than the current one, when that comes before the appeal period's end. */
function losingTime(panel: SectionData<AppealPanel>): number | null {
  const terms = panelTerms(panel);
  return terms === undefined ? null : losingDeadline(terms);
}

function timeLeft(deadline: number, now: number): string {
  return now >= deadline ? "Ended" : formatDuration(deadline - now);
}

/** The countdown's spaces do not break, so it stays one piece if the line ever wraps. */
function losingLine(losing: number, now: number): string {
  return `Losing side: ${timeLeft(losing, now).replaceAll(" ", "\u00a0")}`;
}

function currentLines(column: Extract<TimelineColumn, { state: "current" }>, now: number, losing: number | null): string[] | undefined {
  const { deadline } = column;
  if (deadline === null) return undefined;
  if (!Number.isFinite(deadline)) return ["Unknown"];
  if (now >= deadline) return ["Ended"];
  const countdown = formatDuration(deadline - now);
  if (column.name !== "appeal" || losing === null) return [countdown];
  return [countdown, losingLine(losing, now)];
}

/**
 * "Concluded" for a past period, the bare duration of an upcoming one. The current one counts down to its end, then says
 * "Ended"; in the appeal period a second line follows for the losing side when its funding closes first. A step without
 * a state gets no subitems at all: the library would still render and announce an empty one.
 */
function stateLines(column: TimelineColumn, now: number, losing: number | null): string[] | undefined {
  switch (column.state) {
    case "concluded":
      return ["Concluded"];
    case "current":
      return currentLines(column, now, losing);
    case "upcoming":
      return column.durationSeconds === null ? undefined : [formatDuration(column.durationSeconds)];
  }
}

function appealIsCurrent(columns: readonly TimelineColumn[]): boolean {
  return columns.some((column) => column.name === "appeal" && column.state === "current");
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
function TimelineSteps({ columns, losing }: { readonly columns: readonly TimelineColumn[]; readonly losing: number | null }) {
  const now = useNowSeconds();
  const fourFit = useMediaQuery(LG_MEDIA_QUERY);
  const fiveFit = useMediaQuery(FIVE_STEPS_MEDIA_QUERY);
  const wide = columns.length > 4 ? fiveFit : fourFit;
  const items = columns.map((column) => ({ title: COLUMN_LABELS[column.name], subitems: stateLines(column, now, losing) }));
  const row = appealIsCurrent(columns) ? TIMELINE_H_APPEAL : TIMELINE_H;
  const currentIndex = columns.findIndex((column) => column.state === "current");
  // The library hard-codes its list's name to the orientation alone, so the section carries what the steps are.
  return (
    <section aria-label="Dispute timeline">
      {items[currentIndex]?.subitems !== undefined && <p className="sr-only">The current step shows the time left in its period; the steps after it show how long each lasts.</p>}
      <Steps items={items} currentItemIndex={currentIndex} horizontal={wide} className={wide ? row : TIMELINE_V} />
    </section>
  );
}

/**
 * It needs the dispute's court, so a court that failed to load degrades this section only. The appeal read only adds the
 * losing side's time, so the timeline never waits on it or fails with it.
 */
export function DisputeTimeline({ dispute }: CaseSectionProps) {
  const view = existingView(dispute);
  if (view === null) return null;
  const losing = losingTime(dispute.appealPanel);
  return (
    <SectionContent data={viewField(view, (value) => value.timeline)} section="Timeline" loading={<SectionSkeleton variant="text" lines={2} />}>
      {(timeline, reveal) => (
        <div className={["border-t border-(--dr-record-edge) pt-6", reveal].filter(Boolean).join(" ")}>
          <TimelineSteps columns={timeline.columns} losing={losing} />
        </div>
      )}
    </SectionContent>
  );
}
