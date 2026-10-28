import type { CardFundingState } from "@dispute-resolver/core";
import { useId } from "react";
import { Countdown, FACT, LABEL, Timestamp } from "../../ui";
import { DEADLINE_USED_HERE, FUNDING_CLOSED, FUNDING_CLOSED_AT, FUNDING_CLOSED_HERE, FUNDING_CLOSES, FUNDING_STOPPED_HERE_AT } from "./copy";

export interface FundingProgressProps {
  /** Above 100 when a side was over-funded; the bar shows it as full. */
  readonly percent: number;
  readonly deadline: number;
  readonly state: CardFundingState;
  /** Whether the registry verified the contract's rules; otherwise the deadline is only the one the Dispute Resolver applies. */
  readonly verified: boolean;
  /** The id of the text that says why a closed or fully funded card takes no contribution, for the field and Fund to point at. */
  readonly statusId: string;
}

/** The track is the element itself in Firefox and its `-webkit-progress-bar` elsewhere; the fill is the progress value. */
const BAR_CLASS =
  "block h-2 w-full appearance-none overflow-hidden rounded-full border-0 bg-klerosUIComponentsStroke [&::-webkit-progress-bar]:bg-klerosUIComponentsStroke [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-klerosUIComponentsPrimaryBlue [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-klerosUIComponentsPrimaryBlue";

const ROW_CLASS = "flex flex-wrap items-baseline justify-between gap-2";

const DATE_LINE_CLASS = `${LABEL} [overflow-wrap:anywhere]`;

/** Short enough to fit a card's width whole, so its time zone never sits alone on a line. */
const DATE_CLASS = "whitespace-nowrap";

/** On a contract whose rules were not verified, "closed" is said of the Dispute Resolver only, never of the contract. */
function FundingState({ deadline, state, verified, statusId }: Omit<FundingProgressProps, "percent">) {
  switch (state) {
    case "open":
      return (
        <div className="flex flex-col gap-1">
          <p className={ROW_CLASS}>
            <span className={LABEL}>Time left to fund</span>
            <Countdown target={deadline} className={FACT} />
          </p>
          <p className={DATE_LINE_CLASS}>
            {verified ? FUNDING_CLOSES : DEADLINE_USED_HERE}
            <Timestamp value={deadline} className={DATE_CLASS} />
          </p>
        </div>
      );
    case "closed":
      return (
        <div className="flex flex-col gap-1">
          <p className={ROW_CLASS}>
            <span className={LABEL}>Funding</span>
            <span className={FACT}>{verified ? FUNDING_CLOSED : FUNDING_CLOSED_HERE}</span>
          </p>
          <p id={statusId} className={DATE_LINE_CLASS}>
            {verified ? FUNDING_CLOSED_AT : FUNDING_STOPPED_HERE_AT}
            <Timestamp value={deadline} className={DATE_CLASS} />
          </p>
        </div>
      );
    case "funded":
      return (
        <p className={ROW_CLASS}>
          <span className={LABEL}>Funding</span>
          <span id={statusId} className={FACT}>
            Fully funded
          </span>
        </p>
      );
  }
}

export function FundingProgress({ percent, deadline, state, verified, statusId }: FundingProgressProps) {
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
      <FundingState deadline={deadline} state={state} verified={verified} statusId={statusId} />
    </div>
  );
}
