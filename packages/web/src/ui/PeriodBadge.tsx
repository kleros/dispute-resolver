import type { Period } from "@dispute-resolver/core";
import type { PeriodBadgeProps } from "./types";

interface PeriodStyle {
  readonly label: string;
  readonly dot: string;
}

const PERIOD_STYLES: Readonly<Record<Period, PeriodStyle>> = {
  0: { label: "Evidence", dot: "bg-klerosUIComponentsPrimaryBlue" },
  1: { label: "Commit", dot: "bg-klerosUIComponentsSecondaryPurple" },
  2: { label: "Voting", dot: "bg-klerosUIComponentsTint" },
  3: { label: "Appeal", dot: "bg-klerosUIComponentsWarning" },
  4: { label: "Execution", dot: "bg-klerosUIComponentsSuccess" },
};

const UNKNOWN_PERIOD: PeriodStyle = { label: "Unknown period", dot: "bg-klerosUIComponentsSecondaryText" };

/** A dispute's period as a colored dot and its name (spec 3: one color per period). */
export function PeriodBadge({ period, className }: PeriodBadgeProps) {
  // A bad dispute can carry a period outside 0–4; it renders a neutral badge instead of crashing (D-36).
  const style: PeriodStyle | undefined = (PERIOD_STYLES as Readonly<Partial<Record<number, PeriodStyle>>>)[period];
  const { label, dot } = style ?? UNKNOWN_PERIOD;
  return (
    <span
      className={
        className === undefined
          ? "inline-flex items-center gap-2 text-sm font-semibold text-klerosUIComponentsPrimaryText"
          : `inline-flex items-center gap-2 text-sm font-semibold text-klerosUIComponentsPrimaryText ${className}`
      }
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
