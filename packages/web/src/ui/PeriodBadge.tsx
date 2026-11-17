import type { Period } from "@dispute-resolver/core";
import { PERIOD_COLOR, type PeriodColor } from "./periodColor";
import type { PeriodBadgeProps } from "./types";

interface PeriodStyle {
  readonly label: string;
  readonly dot: string;
}

// Whole class names, since Tailwind only generates the classes it finds written out in the source.
const DOT_FILL: Readonly<Record<PeriodColor, string>> = {
  Success: "bg-klerosUIComponentsSuccess",
  PrimaryBlue: "bg-klerosUIComponentsPrimaryBlue",
  Error: "bg-klerosUIComponentsError",
  SecondaryText: "bg-klerosUIComponentsSecondaryText",
};

const PERIOD_STYLES: Readonly<Record<Period, PeriodStyle>> = {
  0: { label: "Evidence", dot: DOT_FILL[PERIOD_COLOR[0]] },
  1: { label: "Commit", dot: DOT_FILL[PERIOD_COLOR[1]] },
  2: { label: "Voting", dot: DOT_FILL[PERIOD_COLOR[2]] },
  3: { label: "Appeal", dot: DOT_FILL[PERIOD_COLOR[3]] },
  4: { label: "Execution", dot: DOT_FILL[PERIOD_COLOR[4]] },
};

const UNKNOWN_PERIOD: PeriodStyle = { label: "Unknown period", dot: DOT_FILL.SecondaryText };

const PILL_BADGE =
  "inline-flex items-center gap-2 rounded-full border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground font-semibold text-klerosUIComponentsPrimaryText";
const PILL_SIZE = { sm: "h-7 px-3 text-sm", lg: "h-9 px-4 text-base" } as const;
const PILL_DOT_SIZE = { sm: "size-2", lg: "size-2.5" } as const;

/** The name is the indicator and the dot is redundant, so color is never the only cue (WCAG 1.4.1). */
export function PeriodBadge({ period, size = "sm", className }: PeriodBadgeProps) {
  // A bad dispute can carry a period outside 0–4.
  const style: PeriodStyle | undefined = (PERIOD_STYLES as Readonly<Partial<Record<number, PeriodStyle>>>)[period];
  const { label, dot } = style ?? UNKNOWN_PERIOD;
  const base = `${PILL_BADGE} ${PILL_SIZE[size]}`;
  return (
    <span className={className === undefined ? base : `${base} ${className}`}>
      <span aria-hidden="true" className={`${PILL_DOT_SIZE[size]} shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
