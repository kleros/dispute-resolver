import type { SectionSkeletonProps } from "./types";

const BLOCK = "animate-loading rounded-base bg-klerosUIComponentsStroke";
const CARD = "flex flex-col gap-3 rounded-base border border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground p-4";
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

function CardPlaceholder({ lines, item }: { readonly lines: number; readonly item: boolean }) {
  return (
    <div className={CARD} data-skeleton-item={item ? "" : undefined}>
      <div className={`${BLOCK} h-6 w-1/3`} />
      {keys("card-line", lines).map((id) => (
        <div key={id} className={`${BLOCK} h-4 w-full`} />
      ))}
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
          <CardPlaceholder key={id} lines={3} item />
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
