import type { Period } from "@dispute-resolver/core";

/** One of the four open periods, or "all" (labelled "Ongoing"), which shows every card. */
export type PeriodFilter = Exclude<Period, 4> | "all";

export interface PeriodFilterOption {
  readonly id: string;
  readonly filter: PeriodFilter;
  readonly label: string;
  /** The period's color, as `PeriodBadge` draws it; "Ongoing" covers every period, so its dot is the neutral text colour. */
  readonly dot: string;
}

const ALL_PERIODS: PeriodFilterOption = { id: "all", filter: "all", label: "Ongoing", dot: "var(--klerosUIComponentsPrimaryText)" };

export const PERIOD_FILTER_OPTIONS: readonly PeriodFilterOption[] = [
  { id: "evidence", filter: 0, label: "Evidence", dot: "var(--klerosUIComponentsPrimaryBlue)" },
  { id: "commit", filter: 1, label: "Commit", dot: "var(--klerosUIComponentsSecondaryPurple)" },
  { id: "voting", filter: 2, label: "Voting", dot: "var(--klerosUIComponentsTint)" },
  { id: "appeal", filter: 3, label: "Appeal", dot: "var(--klerosUIComponentsWarning)" },
  ALL_PERIODS,
];

export const DEFAULT_PERIOD_FILTER: PeriodFilter = "all";

export function matchesFilter(period: Period, filter: PeriodFilter): boolean {
  return filter === "all" || period === filter;
}

export function filterOption(filter: PeriodFilter): PeriodFilterOption {
  return PERIOD_FILTER_OPTIONS.find((option) => option.filter === filter) ?? ALL_PERIODS;
}

/** The filter an address names by its option ID; a missing or unknown value is every open dispute. */
export function filterFromParam(value: string | null): PeriodFilter {
  return PERIOD_FILTER_OPTIONS.find((option) => option.id === value)?.filter ?? DEFAULT_PERIOD_FILTER;
}
