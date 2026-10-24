import { CustomAccordion } from "@kleros/ui-components-library";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ExpandIndicator } from "../../ui";

export interface CaseAccordionItem {
  readonly title: string;
  readonly body: ReactNode;
}

type ExpandedChange = (index: number, expanded: boolean) => void;

/** The `expandButton` render functions are built outside the accordion component, so the callback reaches them through context. */
const ExpandedChangeContext = createContext<ExpandedChange>(() => undefined);

interface ReportingIndicatorProps {
  readonly index: number;
  readonly expanded: boolean;
}

/** Also tells the accordion which item the library opened: the library does not expose its open state. */
function ReportingIndicator({ index, expanded }: ReportingIndicatorProps) {
  const onExpandedChange = useContext(ExpandedChangeContext);
  useEffect(() => {
    onExpandedChange(index, expanded);
  }, [index, expanded, onExpandedChange]);
  return <ExpandIndicator expanded={expanded} />;
}

function expandIndicatorFor(index: number) {
  return function renderExpandIndicator({ expanded }: { readonly expanded: boolean }) {
    return <ReportingIndicator index={index} expanded={expanded} />;
  };
}

/** Must equal `--acc-collapse` and the library's `--klerosUIComponentsTransitionSpeed`: a closing body stays shown while it runs. */
const COLLAPSE_MS = 250;

/** Replaces the library's ease-in-out on the height wrapper, keeping its duration. */
const HEIGHT_EASE = "[&>div>div:last-child]:ease-(--acc-ease)";

/** Hiding runs on a timer, so it never waits on a transition end event that may not fire. */
const BODY_MOTION =
  "animate-[t-acc-in_var(--acc-expand)_var(--acc-ease)_backwards] transition-[opacity,filter] duration-(--acc-collapse) ease-(--acc-ease) data-[open=false]:opacity-0 data-[open=false]:blur-[2px] motion-reduce:animate-none motion-reduce:transition-none";

/**
 * The negative margins cancel the library's `p-4 md:p-8` on the measured body wrapper inside its border box, so the
 * measured height still equals this box and nothing is clipped.
 */
const BODY_CLASS =
  "-mx-4 -mt-4 -mb-4 md:-mx-8 md:-mt-8 md:-mb-8 rounded-b-base border border-t-0 border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground px-4 py-4 md:px-8 md:py-6";

/**
 * A collapsed body stays mounted, but it is `hidden` once its collapse animation ends: the library only shrinks it to
 * zero height, which would leave its buttons and fields reachable by keyboard while invisible. Give the accordion a
 * `key` that changes with the dispute, so a new dispute starts collapsed.
 */
export function CaseAccordion({ items, className }: { readonly items: readonly CaseAccordionItem[]; readonly className?: string }) {
  const [open, setOpen] = useState<readonly number[]>([]);
  const [shown, setShown] = useState<readonly number[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);
  const onExpandedChange = useCallback<ExpandedChange>((index, expanded) => {
    clearTimeout(timers.current.get(index));
    setOpen((current) => {
      const others = current.filter((openIndex) => openIndex !== index);
      return expanded ? [...others, index] : others;
    });
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
    <ExpandedChangeContext.Provider value={onExpandedChange}>
      <CustomAccordion
        className={["max-w-none [&>div>button[aria-expanded=true]]:rounded-b-none", HEIGHT_EASE, className].filter(Boolean).join(" ")}
        items={items.map((item, index) => ({
          title: <span className="text-base font-semibold text-klerosUIComponentsPrimaryText">{item.title}</span>,
          body: (
            <section aria-label={item.title} hidden={!shown.includes(index)} data-open={open.includes(index)} className={`${BODY_CLASS} ${BODY_MOTION}`}>
              {item.body}
            </section>
          ),
          expandButton: expandIndicatorFor(index),
        }))}
      />
    </ExpandedChangeContext.Provider>
  );
}
