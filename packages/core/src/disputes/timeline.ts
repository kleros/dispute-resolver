import type { Period } from "../types";
import type { Court, Timeline, TimelineColumn, TimelineColumnName } from "./types";

const COLUMNS: readonly { readonly name: TimelineColumnName; readonly period: Period }[] = [
  { name: "evidence", period: 0 },
  { name: "commit", period: 1 },
  { name: "vote", period: 2 },
  { name: "appeal", period: 3 },
  { name: "execution", period: 4 },
];

function column(name: TimelineColumnName, period: Period, current: Period, lastPeriodChange: number, court: Court): TimelineColumn {
  if (period < current) return { name, state: "concluded" };
  const duration = period === 4 ? null : court.timesPerPeriod[period];
  if (period === current) return { name, state: "current", deadline: duration === null ? null : lastPeriodChange + Number(duration) };
  return { name, state: "upcoming", durationSeconds: duration };
}

/**
 * Commit appears for hidden-vote courts, and for a dispute currently in commit whatever its court says now. Once the
 * ruling is executed no period follows, so every column is concluded.
 */
export function deriveTimeline(input: { readonly period: Period; readonly lastPeriodChange: number; readonly court: Court; readonly executed: boolean }): Timeline {
  const { period, lastPeriodChange, court, executed } = input;
  const passesCommit = court.hiddenVotes || period === 1;
  const shown = COLUMNS.filter((entry) => entry.period !== 1 || passesCommit);
  if (executed) return { columns: shown.map((entry): TimelineColumn => ({ name: entry.name, state: "concluded" })) };
  return { columns: shown.map((entry) => column(entry.name, entry.period, period, lastPeriodChange, court)) };
}
