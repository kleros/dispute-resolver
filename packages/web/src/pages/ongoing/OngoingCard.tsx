import type { ChainId, Court, OngoingDispute } from "@dispute-resolver/core";
import { Card } from "@kleros/ui-components-library";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { OngoingTitle, SectionData } from "../../data";
import { paths } from "../../routing";
import { CHIP_INFO, Countdown, FACT_LEAD, FACT_SMALL, LABEL, PeriodBadge } from "../../ui";

/** The library `Card` is a fixed 328×200 box; the grid sizes the cards instead (ARCHITECTURE.md §11.5). */
const CARD_CLASS =
  "flex h-full w-full flex-col gap-4 overflow-hidden p-4 transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none group-hover:border-klerosUIComponentsPrimaryBlue group-hover:shadow-(--dr-elevation) lg:p-6";
/** The focus ring sits on this link, outside the card's `overflow-hidden`, so it is never clipped (contract §8). */
const LINK_CLASS = "group block h-full rounded-[18px] text-klerosUIComponentsPrimaryText no-underline";
const TITLE_CLASS = "line-clamp-2 min-h-14 text-lg leading-7 font-semibold text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]";
/** The countdown band: the plate under the card's decisive fact, bleeding to the card's edges (contract §1, §12). */
const BAND_CLASS = "mt-auto -mx-4 -mb-4 flex items-center gap-2 bg-klerosUIComponentsMediumBlue px-4 py-3 lg:-mx-6 lg:-mb-6 lg:px-6";
const SKELETON_LINE = "block h-4 animate-loading rounded-base bg-klerosUIComponentsStroke";

/**
 * The court badge's text (spec §3): the court's name; its ID with "name unavailable" when its policy failed (D-19);
 * its ID with "unavailable" when the court list failed or does not hold it (D-36: today's card throws). `null` while the
 * courts load.
 */
export function courtLabel(courts: SectionData<readonly Court[]>, subcourtId: bigint): string | null {
  if (courts.status === "loading") return null;
  const court = courts.status === "ready" ? courts.value.find((candidate) => candidate.id === subcourtId) : undefined;
  if (court === undefined) return `Court ${subcourtId.toString()} (unavailable)`;
  return court.name ?? `Court ${subcourtId.toString()} (name unavailable)`;
}

/** The card title (spec §3, D-37): the meta-evidence title, "Meta Evidence Missing", or the ID with "title unavailable". */
function CardTitle({ title, disputeId }: { readonly title: SectionData<OngoingTitle>; readonly disputeId: bigint }) {
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
    return <h2 className={`${TITLE_CLASS} font-normal text-klerosUIComponentsSecondaryText`}>Dispute {disputeId.toString()}: title unavailable</h2>;
  }
  return <h2 className={TITLE_CLASS}>{title.value.kind === "title" ? title.value.text : "Meta Evidence Missing"}</h2>;
}

/** The court as an informational stamp chip (contract §7). Not the library `Tag`: that is a button, and the whole card is already a link (§3.4). */
function CourtTag({ label }: { readonly label: string | null }) {
  if (label === null) {
    return (
      <span aria-busy="true" className="inline-flex h-7 w-28 animate-loading rounded-full bg-klerosUIComponentsStroke">
        <span className="sr-only">Loading the court</span>
      </span>
    );
  }
  return (
    <span className={`${CHIP_INFO} min-w-0 self-start`}>
      <span className="truncate">{label}</span>
    </span>
  );
}

function HourglassIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 fill-none stroke-klerosUIComponentsPrimaryText" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
 * One open dispute (spec §3, ARCHITECTURE.md §11.5): period, ID, title, court and the time left in the period. As today,
 * the countdown shows whenever the period's end is known (its court is loaded), and a passed end reads as zeros: today's
 * guard compares an absolute timestamp with zero (`ongoing-card.js:15-25, 56`), so it never hides a passed period.
 */
export function OngoingCard({ chainId, dispute, title, courts }: OngoingCardProps) {
  const countdown = dispute.countdownTarget;
  return (
    <CardShell chainId={chainId} disputeId={dispute.id}>
      <div className="flex items-center justify-between gap-3">
        <PeriodBadge variant="pill" size="sm" period={dispute.period} />
        <span className={`${FACT_SMALL} tabular-nums`}>#{dispute.id.toString()}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <CardTitle title={title} disputeId={dispute.id} />
        <CourtTag label={courtLabel(courts, dispute.subcourtId)} />
      </div>
      {countdown === null ? null : (
        <div className={BAND_CLASS}>
          <HourglassIcon />
          <span className="sr-only">Period ends in</span>
          <Countdown target={countdown} className={FACT_LEAD} />
        </div>
      )}
    </CardShell>
  );
}

/**
 * A listed dispute whose `disputes(id)` read failed (ARCHITECTURE.md §5.5): its ID with "details unavailable" instead of
 * dropping it (D-37). Its period is unknown, so it shows only under "Ongoing".
 */
export function FailedDisputeCard({ chainId, disputeId }: { readonly chainId: ChainId; readonly disputeId: bigint }) {
  return (
    <CardShell chainId={chainId} disputeId={disputeId}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-klerosUIComponentsSecondaryText">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-klerosUIComponentsSecondaryText" />
          Period unknown
        </span>
        <span className="text-sm font-semibold text-klerosUIComponentsSecondaryText tabular-nums">#{disputeId.toString()}</span>
      </div>
      <h2 className={`${TITLE_CLASS} font-normal text-klerosUIComponentsSecondaryText`}>Dispute {disputeId.toString()}: details unavailable</h2>
      <p className={`${LABEL} mt-auto`}>The arbitrator&apos;s record of this dispute could not be read.</p>
    </CardShell>
  );
}
