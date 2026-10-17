import type { Period } from "@dispute-resolver/core";

/** The Ongoing filter (spec §3): one of the four open periods, or "Ongoing", which shows every card. */
export type PeriodFilter = Exclude<Period, 4> | "all";

export interface PeriodFilterOption {
  /** The dropdown item's key. */
  readonly id: string;
  readonly filter: PeriodFilter;
  readonly label: string;
  /** The period's color, as `PeriodBadge` draws it; transparent for "Ongoing", which keeps the slot. */
  readonly dot: string;
}

/** "Ongoing": every card, the default (spec §3). */
const ALL_PERIODS: PeriodFilterOption = { id: "all", filter: "all", label: "Ongoing", dot: "transparent" };

/** Today's order and names (spec §3): Evidence, Commit, Voting, Appeal, then "Ongoing". */
export const PERIOD_FILTER_OPTIONS: readonly PeriodFilterOption[] = [
  { id: "evidence", filter: 0, label: "Evidence", dot: "var(--klerosUIComponentsPrimaryBlue)" },
  { id: "commit", filter: 1, label: "Commit", dot: "var(--klerosUIComponentsSecondaryPurple)" },
  { id: "voting", filter: 2, label: "Voting", dot: "var(--klerosUIComponentsTint)" },
  { id: "appeal", filter: 3, label: "Appeal", dot: "var(--klerosUIComponentsWarning)" },
  ALL_PERIODS,
];

export const DEFAULT_PERIOD_FILTER: PeriodFilter = "all";

/** A card is visible when its period equals the filter or the filter is "Ongoing" (spec §3). */
export function matchesFilter(period: Period, filter: PeriodFilter): boolean {
  return filter === "all" || period === filter;
}

export function filterOption(filter: PeriodFilter): PeriodFilterOption {
  return PERIOD_FILTER_OPTIONS.find((option) => option.filter === filter) ?? ALL_PERIODS;
}
