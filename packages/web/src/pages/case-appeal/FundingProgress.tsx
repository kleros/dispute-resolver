import type { UnixSeconds } from "@dispute-resolver/core";
import { LinearProgress } from "@kleros/ui-components-library";
import { Countdown } from "../../ui";
import { useElementWidth } from "./useElementWidth";

/** Until the bar's container is measured; fits a card at a 375 px viewport. */
const FALLBACK_WIDTH = 240;

export interface FundingProgressProps {
  /** Spec §5.12 funding percentage; above 100 when a side was over-funded, which the bar shows as full. */
  readonly percent: number;
  readonly deadline: UnixSeconds;
}

/** "{pct}% Funded" with a progress bar and the countdown to the side's deadline (spec §5.12 card contents). */
export function FundingProgress({ percent, deadline }: FundingProgressProps) {
  const [measure, width] = useElementWidth(FALLBACK_WIDTH);
  return (
    <div className="flex flex-col gap-1">
      <div ref={measure} className="w-full min-w-0 overflow-hidden">
        <LinearProgress value={Math.min(Math.max(percent, 0), 100)} width={width} valueLabel={`${percent.toFixed(2)}% Funded`} />
      </div>
      <p className="flex items-center justify-between gap-2 text-sm">
        <span className="text-klerosUIComponentsSecondaryText">Time left to fund</span>
        <Countdown target={deadline} className="font-semibold" />
      </p>
    </div>
  );
}
