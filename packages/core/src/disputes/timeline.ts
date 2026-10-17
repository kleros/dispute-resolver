import type { Period, UnixSeconds } from "../types";
import type { Court, Timeline, TimelineColumn, TimelineColumnName } from "./types";

const COLUMNS: readonly { readonly name: TimelineColumnName; readonly period: Period }[] = [
  { name: "evidence", period: 0 },
  { name: "commit", period: 1 },
  { name: "vote", period: 2 },
  { name: "appeal", period: 3 },
  { name: "execution", period: 4 },
];

/** Seconds of a period from the court's `timesPerPeriod`; execution has no duration. */
function periodDuration(court: Court, period: Period): bigint | null {
  return period === 4 ? null : court.timesPerPeriod[period];
}

function column(name: TimelineColumnName, period: Period, current: Period, lastPeriodChange: UnixSeconds, court: Court): TimelineColumn {
  if (period < current) return { name, state: "concluded" };
  const duration = periodDuration(court, period);
  if (period === current) return { name, state: "current", deadline: duration === null ? null : lastPeriodChange + Number(duration) };
  return { name, state: "upcoming", durationSeconds: duration };
}

/**
 * The timeline columns of a dispute (spec 5.7, D-39): Evidence, Commit, Vote, Appeal and Execution, every period the
 * dispute passes through. Commit appears for hidden-vote courts, and for a dispute currently in commit whatever its
 * court says now. Earlier periods are concluded; the current one ends at `lastPeriodChange + timesPerPeriod[period]`
 * (no deadline in execution); later ones show their duration (none for execution).
 */
export function deriveTimeline(input: { readonly period: Period; readonly lastPeriodChange: UnixSeconds; readonly court: Court }): Timeline {
  const { period, lastPeriodChange, court } = input;
  const passesCommit = court.hiddenVotes || period === 1;
  return {
    columns: COLUMNS.filter((entry) => entry.period !== 1 || passesCommit).map((entry) => column(entry.name, entry.period, period, lastPeriodChange, court)),
  };
}
