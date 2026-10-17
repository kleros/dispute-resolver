import type { SectionSkeletonProps } from "./types";

const BLOCK = "animate-loading rounded-base bg-klerosUIComponentsStroke";
/** A page-level card (contract §6): 18 px, the section-card padding. */
const CARD = "flex flex-col gap-3 rounded-[18px] border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-4 lg:px-8 lg:py-6";
/**
 * An Ongoing card placeholder in the loaded card's rows: the period pill and the ID, the two-line title over the court
 * chip, the countdown band. At lg it is 232 px tall like the loaded card, so no row jumps when the list resolves.
 */
const GRID_CARD = "flex h-full flex-col gap-4 overflow-hidden rounded-[18px] border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-4 lg:p-6";
/** The period pill; its own string, so no radius conflicts with BLOCK's. */
const PILL_BLOCK = "h-7 w-24 animate-loading rounded-full bg-klerosUIComponentsStroke";
/** The court chip; its own string, like the pill. */
const CHIP_BLOCK = "h-7 w-28 animate-loading rounded-full bg-klerosUIComponentsStroke";
/**
 * The countdown band, flush with the card's edges and as tall as the loaded one: 52 px below sm, where its countdown is
 * 1.25rem, 56 px from sm. No radius of its own; the card clips it.
 */
const GRID_BAND = "mt-auto -mx-4 -mb-4 h-13 animate-loading bg-klerosUIComponentsStroke sm:h-14 lg:-mx-6 lg:-mb-6";
/** A collapsed library accordion item: a 49 px bar, spaced like the library's items. */
const BAR = "my-2 h-[49px] w-full rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground";
/** Line widths cycle so the placeholder reads as text; the last line is always shorter. */
const LINE_WIDTHS = ["w-full", "w-11/12", "w-4/5", "w-full", "w-5/6"] as const;
const MAX_ITEMS = 24;

function itemCount(lines: number | undefined, fallback: number): number {
  if (lines === undefined || !Number.isFinite(lines)) {
    return fallback;
  }
  return Math.min(MAX_ITEMS, Math.max(1, Math.floor(lines)));
}

function keys(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, position) => `${prefix}-${String(position)}`);
}

function lineWidth(position: number, count: number): string {
  if (count > 1 && position === count - 1) {
    return "w-1/2";
  }
  return LINE_WIDTHS[position % LINE_WIDTHS.length] ?? "w-full";
}

function TextLines({ count }: { readonly count: number }) {
  const ids = keys("line", count);
  return (
    <>
      {ids.map((id, position) => (
        <div key={id} data-skeleton-item="" className={`${BLOCK} h-4 ${lineWidth(position, count)}`} />
      ))}
    </>
  );
}

function GridCardPlaceholder() {
  return (
    <div className={GRID_CARD} data-skeleton-item="">
      <div className="flex items-center justify-between">
        <div className={PILL_BLOCK} />
        <div className={`${BLOCK} h-5 w-12`} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex min-h-14 flex-col justify-center gap-2">
          <div className={`${BLOCK} h-5 w-full`} />
          <div className={`${BLOCK} h-5 w-2/3`} />
        </div>
        <div className={CHIP_BLOCK} />
      </div>
      <div className={GRID_BAND} />
    </div>
  );
}

/** The loading state every section shares (11.3): token-colored blocks with the library's loading animation. */
export function SectionSkeleton({ variant, lines }: SectionSkeletonProps) {
  let content;
  if (variant === "grid") {
    content = (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {keys("card", itemCount(lines, 6)).map((id) => (
          <GridCardPlaceholder key={id} />
        ))}
      </div>
    );
  } else if (variant === "bars") {
    content = (
      <div>
        {keys("bar", itemCount(lines, 3)).map((id) => (
          <div key={id} data-skeleton-item="" className={BAR} />
        ))}
      </div>
    );
  } else if (variant === "card") {
    content = (
      <div className={CARD}>
        <div className={`${BLOCK} h-6 w-1/3`} />
        <TextLines count={itemCount(lines, 3)} />
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col gap-3">
        <TextLines count={itemCount(lines, 3)} />
      </div>
    );
  }
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="w-full">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true">{content}</div>
    </div>
  );
}
