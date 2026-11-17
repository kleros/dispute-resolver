import type { Period } from "@dispute-resolver/core";

/** The old Dispute Resolver's period colours, named by library token; Commit and Voting share the blue. */
export const PERIOD_COLOR = {
  0: "Success",
  1: "PrimaryBlue",
  2: "PrimaryBlue",
  3: "Error",
  4: "SecondaryText",
} as const satisfies Readonly<Record<Period, string>>;

export type PeriodColor = (typeof PERIOD_COLOR)[Period];

export function periodColorVar(period: Period): string {
  return `var(--klerosUIComponents${PERIOD_COLOR[period]})`;
}
