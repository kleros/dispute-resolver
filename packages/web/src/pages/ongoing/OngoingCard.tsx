import type { ChainId, Court, OngoingDispute } from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { OngoingTitle, SectionData } from "../../data";
import { paths } from "../../routing";
import { Countdown, FACT_SMALL, LABEL, PeriodBadge, useRevealIn } from "../../ui";

/** The library `Card` is a fixed 328×200 box; the grid sizes the cards instead. */
const CARD_CLASS =
  "flex h-full w-full flex-col overflow-hidden p-0 transition-[border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-hover:border-klerosUIComponentsPrimaryBlue";
/** The focus ring sits on this link, outside the card's `overflow-hidden`, so it is never clipped. */
const LINK_CLASS = "group t-learn block h-full rounded-[18px] text-klerosUIComponentsPrimaryText no-underline";
const TITLE_CLASS = "line-clamp-2 min-h-14 text-lg leading-7 font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]";
const HEAD_CLASS = "flex items-center justify-between gap-3 px-4 pt-4 lg:px-6 lg:pt-6";
const BODY_CLASS = "flex min-w-0 flex-1 flex-col gap-4 px-4 pt-3 pb-4 lg:px-6 lg:pb-6";
/** Always drawn, even without a countdown, so every card in a row ends on the same strip and the arrow. */
const FOOT_CLASS = "flex min-h-12 items-center justify-between gap-3 border-t border-klerosUIComponentsStroke bg-klerosUIComponentsMediumBlue px-4 py-3 lg:px-6";
const SKELETON_LINE = "block h-4 animate-loading rounded-base bg-klerosUIComponentsStroke";
/** The arrow's apex in its 16-unit box, the point its arms spread about on hover. */
const ARROW_APEX = { transformOrigin: "13px 8px" } as const;

/**
 * The court line's text: the court's name; its ID with "name unavailable" when its policy failed; its ID with
 * "unavailable" when the court list failed or does not hold it. `null` while the courts load.
 */
function courtLabel(courts: SectionData<readonly Court[]>, subcourtId: bigint): string | null {
  if (courts.status === "loading") return null;
  const court = courts.status === "ready" ? courts.value.find((candidate) => candidate.id === subcourtId) : undefined;
  if (court === undefined) return `Court ${subcourtId.toString()} (unavailable)`;
  return court.name ?? `Court ${subcourtId.toString()} (name unavailable)`;
}

function CardTitle({ title, disputeId }: { readonly title: SectionData<OngoingTitle>; readonly disputeId: bigint }) {
  const reveal = useRevealIn(title.status === "loading");
  const titleClass = reveal === undefined ? TITLE_CLASS : `${TITLE_CLASS} ${reveal}`;
  if (title.status === "loading") {
    return (
      <h2 aria-busy="true" className={`${TITLE_CLASS} flex flex-col justify-center gap-2`}>
        <span className="sr-only">Loading the title</span>
        <span aria-hidden="true" className={`${SKELETON_LINE} w-full`} />
        <span aria-hidden="true" className={`${SKELETON_LINE} w-2/3`} />
      </h2>
    );
  }
  if (title.status === "unavailable") {
    return <h2 className={`${titleClass} font-normal text-klerosUIComponentsSecondaryText`}>Dispute {disputeId.toString()}: title unavailable</h2>;
  }
  return <h2 className={titleClass}>{title.value.kind === "title" ? title.value.text : "Meta Evidence Missing"}</h2>;
}

export function ScalesIcon({ className = "size-4 stroke-klerosUIComponentsSecondaryText" }: { readonly className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`shrink-0 fill-none ${className}`} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v12M5 14h6M3 4.5h10M8 3.5l-5 1M8 3.5l5 1M3 4.5 1.25 9a1.75 1.75 0 0 0 3.5 0L3 4.5ZM13 4.5 11.25 9a1.75 1.75 0 0 0 3.5 0L13 4.5Z" />
    </svg>
  );
}

/**
 * `ml-auto` keeps the arrow at the right end when the foot holds no countdown. The arms are separate paths so that, on the
 * card link's hover, the arrow can shift forward while they spread about the apex.
 */
function ArrowIcon() {
  return (
    <span aria-hidden="true" className="t-learn-chevron ml-auto shrink-0">
      <svg viewBox="0 0 16 16" className="size-4 fill-none stroke-klerosUIComponentsPrimaryBlue" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8h10" />
        <path className="t-learn-arm t-learn-arm-top" style={ARROW_APEX} d="M9 4L13 8" />
        <path className="t-learn-arm t-learn-arm-bot" style={ARROW_APEX} d="M13 8L9 12" />
      </svg>
    </span>
  );
}

/** A plain line, not the library `Tag`: that is a button, and the whole card is already a link. */
function CourtLine({ label }: { readonly label: string | null }) {
  const reveal = useRevealIn(label === null);
  const lineClass = `${LABEL} mt-auto flex min-w-0 items-center gap-2`;
  if (label === null) {
    return (
      <span aria-busy="true" className="mt-auto inline-flex h-5 w-32 animate-loading rounded-base bg-klerosUIComponentsStroke">
        <span className="sr-only">Loading the court</span>
      </span>
    );
  }
  return (
    <span className={reveal === undefined ? lineClass : `${lineClass} ${reveal}`}>
      <ScalesIcon />
      <span className="truncate">{label}</span>
    </span>
  );
}

function HourglassIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0 fill-none stroke-klerosUIComponentsPrimaryText"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 1.75h8M4 14.25h8M4.75 1.75v2.1c0 1.2.6 2.3 1.6 2.95L8 7.9l1.65-1.1a3.5 3.5 0 0 0 1.6-2.95v-2.1M4.75 14.25v-2.1c0-1.2.6-2.3 1.6-2.95L8 8.1l1.65 1.1a3.5 3.5 0 0 1 1.6 2.95v2.1" />
    </svg>
  );
}

function CardShell({ chainId, disputeId, children }: { readonly chainId: ChainId; readonly disputeId: bigint; readonly children: ReactNode }) {
  return (
    <Link to={paths.case(chainId, disputeId)} className={LINK_CLASS}>
      <Card round className={CARD_CLASS}>
        {children}
      </Card>
    </Link>
  );
}

export interface OngoingCardProps {
  readonly chainId: ChainId;
  readonly dispute: OngoingDispute;
  readonly title: SectionData<OngoingTitle>;
  readonly courts: SectionData<readonly Court[]>;
}

/**
 * The countdown shows whenever the period's end is known (its court is loaded); a passed end reads as zeros rather than
 * hiding the countdown.
 */
export function OngoingCard({ chainId, dispute, title, courts }: OngoingCardProps) {
  const countdown = dispute.countdownTarget;
  return (
    <CardShell chainId={chainId} disputeId={dispute.id}>
      <div className={HEAD_CLASS}>
        <PeriodBadge variant="pill" size="sm" period={dispute.period} />
        <span className="text-sm text-klerosUIComponentsSecondaryText tabular-nums">
          #<span className="font-semibold text-klerosUIComponentsPrimaryText">{dispute.id.toString()}</span>
        </span>
      </div>
      <div className={BODY_CLASS}>
        <CardTitle title={title} disputeId={dispute.id} />
        <CourtLine label={courtLabel(courts, dispute.subcourtId)} />
      </div>
      <div className={FOOT_CLASS}>
        {countdown === null ? null : (
          <span className="flex min-w-0 items-center gap-2">
            <HourglassIcon />
            <span className={LABEL}>Period ends in</span>
            <Countdown target={countdown} className={FACT_SMALL} />
          </span>
        )}
        <ArrowIcon />
      </div>
    </CardShell>
  );
}

/**
 * A listed dispute whose `disputes(id)` read failed: its ID with "details unavailable" instead of dropping it. Its period
 * is unknown, so it shows only under "Ongoing". It ends on the same foot strip as its neighbours, holding only the arrow.
 */
export function FailedDisputeCard({ chainId, disputeId }: { readonly chainId: ChainId; readonly disputeId: bigint }) {
  return (
    <CardShell chainId={chainId} disputeId={disputeId}>
      <div className={HEAD_CLASS}>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-klerosUIComponentsSecondaryText">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-klerosUIComponentsSecondaryText" />
          <span>Period unknown</span>
        </span>
        <span className="text-sm font-semibold text-klerosUIComponentsSecondaryText tabular-nums">#{disputeId.toString()}</span>
      </div>
      <div className={BODY_CLASS}>
        <h2 className={`${TITLE_CLASS} font-normal text-klerosUIComponentsSecondaryText`}>Dispute {disputeId.toString()}: details unavailable</h2>
        <p className={`${LABEL} mt-auto`}>The arbitrator&apos;s record of this dispute could not be read.</p>
      </div>
      <div className={FOOT_CLASS}>
        <ArrowIcon />
      </div>
    </CardShell>
  );
}
