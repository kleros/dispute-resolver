import { CustomAccordion } from "@kleros/ui-components-library";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface CaseAccordionItem {
  readonly title: string;
  readonly body: ReactNode;
}

interface ExpandIndicatorProps {
  readonly index: number;
  readonly expanded: boolean;
  readonly onExpandedChange: (index: number, expanded: boolean) => void;
}

/** The plus or minus at the end of an item's header; it also tells the accordion which item the library opened. */
function ExpandIndicator({ index, expanded, onExpandedChange }: ExpandIndicatorProps) {
  useEffect(() => {
    onExpandedChange(index, expanded);
  }, [index, expanded, onExpandedChange]);
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0 fill-none stroke-klerosUIComponentsPrimaryText" strokeWidth="1.75" strokeLinecap="round">
      <path d="M2 8h12" />
      {expanded ? null : <path d="M8 2v12" />}
    </svg>
  );
}

/** The library's collapse animation (`--klerosUIComponentsTransitionSpeed`): a closing body stays shown while it runs. */
const COLLAPSE_MS = 250;

/**
 * The body box joined to its header (A-08). The library pads the measured body wrapper with `p-4 md:p-8`; the negative
 * margins cancel that padding inside the wrapper's border box, so the measured height still equals this box and nothing
 * is clipped. The horizontal padding matches the header's text inset (`px-4 md:px-8`).
 */
const BODY_CLASS =
  "-mx-4 -mt-4 -mb-4 md:-mx-8 md:-mt-8 md:-mb-8 rounded-b-base border border-t-0 border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground px-4 py-4 md:px-8 md:py-6";

/**
 * The case page accordion (spec 5.11): its items all collapsed at first, one open at a time, over the library accordion.
 * A collapsed body stays mounted, so the parity hooks inside it remain readable (§12), but it is `hidden` once its
 * collapse animation ends: the library only shrinks it to zero height, which would leave its buttons and fields
 * reachable by keyboard while invisible. Give the accordion a `key` that changes with the dispute, so a new dispute
 * starts collapsed, as today.
 */
export function CaseAccordion({ items }: { readonly items: readonly CaseAccordionItem[] }) {
  const [shown, setShown] = useState<readonly number[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);
  const onExpandedChange = useCallback((index: number, expanded: boolean) => {
    clearTimeout(timers.current.get(index));
    if (expanded) {
      setShown((current) => (current.includes(index) ? current : [...current, index]));
      return;
    }
    timers.current.set(
      index,
      setTimeout(() => {
        setShown((current) => current.filter((shownIndex) => shownIndex !== index));
      }, COLLAPSE_MS),
    );
  }, []);
  return (
    <CustomAccordion
      className="max-w-none [&>div>button[aria-expanded=true]]:rounded-b-none"
      items={items.map((item, index) => ({
        title: <span className="text-base font-semibold text-klerosUIComponentsPrimaryText">{item.title}</span>,
        body: (
          <div role="region" aria-label={item.title} hidden={!shown.includes(index)} className={BODY_CLASS}>
            {item.body}
          </div>
        ),
        expandButton: ({ expanded }) => <ExpandIndicator index={index} expanded={expanded} onExpandedChange={onExpandedChange} />,
      }))}
    />
  );
}
