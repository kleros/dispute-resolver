import { useId } from "react";
import { Countdown, FACT, LABEL } from "../../ui";

export interface FundingProgressProps {
  /** Above 100 when a side was over-funded; the bar shows it as full. */
  readonly percent: number;
  readonly deadline: number;
}

/** The track is the element itself in Firefox and its `-webkit-progress-bar` elsewhere; the fill is the progress value. */
const BAR_CLASS =
  "block h-2 w-full appearance-none overflow-hidden rounded-full border-0 bg-klerosUIComponentsStroke [&::-webkit-progress-bar]:bg-klerosUIComponentsStroke [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-klerosUIComponentsPrimaryBlue [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-klerosUIComponentsPrimaryBlue";

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
        <progress value={clamped} max={100} aria-labelledby={labelId} aria-valuenow={clamped} aria-valuetext={label} className={BAR_CLASS} />
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={LABEL}>Time left to fund</span>
        <Countdown target={deadline} className={FACT} />
      </p>
    </div>
  );
}
