import { Button, Copiable } from "@kleros/ui-components-library";
import { useEffect, useId, useMemo, useRef, useState, type RefObject, type SyntheticEvent } from "react";
import { flushSync } from "react-dom";
import { plainAddress, plainHead, plainIsBlank, shortened } from "./plainAddress";

const COPY_LABEL = "Copy the submitted text";
const TEXT_CLASS = "rounded-base text-sm text-klerosUIComponentsSecondaryText [overflow-wrap:anywhere]";
// Very long text scrolls inside the row, so the page around it stays usable.
const WHOLE_CLASS = `${TEXT_CLASS} max-h-64 overflow-y-auto border border-klerosUIComponentsStroke p-2`;
// As the address copy control: a 24 px hit area around the 16 px icon, theme tokens on the library's icons, and the same
// icon and tooltip motion; the library's Tooltip reads a `className` that Copiable's type leaves out.
const COPY_CLASS = [
  "[&_button]:-m-1 [&_button]:size-6 [&_button]:p-1 [&_.copy-icon_path]:fill-klerosUIComponentsPrimaryBlue [&_.copied-icon_path]:fill-klerosUIComponentsSuccess",
  "[&_.copied-icon]:animate-[t-icon-in_var(--icon-swap-dur)_var(--icon-swap-ease)_backwards] motion-reduce:[&_.copied-icon]:animate-none",
].join(" ");
const TOOLTIP_PROPS = {
  place: "top" as const,
  className:
    "origin-bottom entering:animate-[t-tooltip-in_var(--tt-in-dur)_var(--tt-in-ease)_var(--tt-delay)_backwards]! exiting:animate-[t-tooltip-out_var(--tt-out-dur)_var(--tt-out-ease)_forwards]!",
};

/**
 * The library's copy button takes no label of its own, so it is named after it mounts; its tooltip trigger is a second
 * focusable wrapper, taken out of the Tab order and the accessibility tree so the control is one Tab stop.
 */
function useCopyLabel(container: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const button = container.current?.querySelector("button") ?? null;
    if (button === null) return;
    button.setAttribute("aria-label", COPY_LABEL);
    const wrapper = button.parentElement?.closest('[role="button"][tabindex="0"]') ?? null;
    if (wrapper === null || container.current?.contains(wrapper) !== true) return;
    wrapper.setAttribute("tabindex", "-1");
    wrapper.removeAttribute("role");
  }, [container]);
}

function onCopyButton(event: SyntheticEvent): boolean {
  return event.target instanceof Element && event.target.closest("button") !== null;
}

/**
 * What was submitted in place of an IPFS file, as plain text: never a link, never fetched. Past 200 characters it is cut
 * until Show all; the copy control always copies all of it. The cut view reads only the start of the value; all of it is
 * made plain only for Show all or once the copy control is reached.
 */
export function SubmittedText({ address }: { readonly address: string }) {
  const start = useMemo(() => plainAddress(plainHead(address)), [address]);
  const short = useMemo(() => shortened(start), [start]);
  const blank = useMemo(() => plainIsBlank(address), [address]);
  const [whole, setWhole] = useState(false);
  // Set by Show all or by reaching the copy control, and kept, so all of the value is made plain once.
  const [wanted, setWanted] = useState(false);
  const text = useMemo(() => {
    if (short === null) return start;
    return wanted ? plainAddress(address) : null;
  }, [address, short, start, wanted]);
  const boxId = useId();
  const copyRef = useRef<HTMLSpanElement>(null);
  useCopyLabel(copyRef);
  if (blank) return null;
  const expanded = whole && short !== null;
  // A click with no press or focus before it (a screen reader's) copies within that same event, so the whole text is
  // rendered into the copy control before the event reaches it.
  const reachCopy = (event: SyntheticEvent): void => {
    if (wanted || !onCopyButton(event)) return;
    flushSync(() => {
      setWanted(true);
    });
  };
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <span ref={copyRef} className={`flex min-w-0 max-w-full ${COPY_CLASS}`} onPointerDownCapture={reachCopy} onFocusCapture={reachCopy} onClickCapture={reachCopy}>
        <Copiable copiableContent={text ?? start} info={COPY_LABEL} tooltipProps={TOOLTIP_PROPS} className="min-w-0 items-start">
          {/* A box that scrolls must take focus so a keyboard can scroll it. */}
          <div id={boxId} tabIndex={expanded ? 0 : undefined} className={expanded ? WHOLE_CLASS : TEXT_CLASS}>
            {expanded ? text : (short ?? start)}
          </div>
        </Copiable>
      </span>
      {short === null ? null : (
        <Button
          text={whole ? "Show less" : "Show all"}
          variant="secondary"
          small
          aria-expanded={whole}
          aria-controls={boxId}
          onPress={() => {
            setWhole((value) => !value);
            setWanted(true);
          }}
        />
      )}
    </div>
  );
}
