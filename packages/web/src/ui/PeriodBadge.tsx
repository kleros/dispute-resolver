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

const DOT_BADGE = "inline-flex items-center gap-2 text-sm font-semibold text-klerosUIComponentsPrimaryText";
const PILL_BADGE =
  "inline-flex items-center gap-2 rounded-full border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground font-semibold text-klerosUIComponentsPrimaryText";
const PILL_SIZE = { sm: "h-7 px-3 text-sm", lg: "h-9 px-4 text-base" } as const;
const PILL_DOT_SIZE = { sm: "size-2", lg: "size-2.5" } as const;

/**
 * A dispute's period as a colored dot and its name (spec 3: one color per period). The `pill` variant sets the same dot
 * and name in the status stamp (contract §7); the name is the indicator and the dot is redundant (WCAG 1.4.1).
 */
export function PeriodBadge({ period, variant = "dot", size = "sm", className }: PeriodBadgeProps) {
  // A bad dispute can carry a period outside 0–4; it renders a neutral badge instead of crashing (D-36).
  const style: PeriodStyle | undefined = (PERIOD_STYLES as Readonly<Partial<Record<number, PeriodStyle>>>)[period];
  const { label, dot } = style ?? UNKNOWN_PERIOD;
  const pill = variant === "pill";
  const base = pill ? `${PILL_BADGE} ${PILL_SIZE[size]}` : DOT_BADGE;
  const dotSize = pill ? PILL_DOT_SIZE[size] : "size-2";
  return (
    <span className={className === undefined ? base : `${base} ${className}`}>
      <span aria-hidden="true" className={`${dotSize} shrink-0 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
