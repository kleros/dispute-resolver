import type { UnixSeconds } from "@dispute-resolver/core";
import { useId } from "react";
import { Countdown, FACT, LABEL } from "../../ui";

export interface FundingProgressProps {
  /** Spec §5.12 funding percentage; above 100 when a side was over-funded, which the bar shows as full. */
  readonly percent: number;
  readonly deadline: UnixSeconds;
}

/**
 * "{pct}% Funded" with a progress bar and the countdown to the side's deadline (spec §5.12 card contents). The bar is a
 * plain track and fill (contract §12): PrimaryBlue on Stroke, static, named by its label.
 */
export function FundingProgress({ percent, deadline }: FundingProgressProps) {
  const labelId = useId();
  const label = `${percent.toFixed(2)}% Funded`;
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span id={labelId} className="text-sm font-semibold text-klerosUIComponentsPrimaryText">
          {label}
        </span>
        <div
          role="progressbar"
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clamped}
          aria-valuetext={label}
          className="h-2 w-full overflow-hidden rounded-full bg-klerosUIComponentsStroke"
        >
          <div className="h-full rounded-full bg-klerosUIComponentsPrimaryBlue" style={{ width: `${String(clamped)}%` }} />
        </div>
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={LABEL}>Time left to fund</span>
        <Countdown target={deadline} className={FACT} />
      </p>
    </div>
  );
}
