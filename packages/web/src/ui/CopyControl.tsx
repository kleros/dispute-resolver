import { Copiable } from "@kleros/ui-components-library";
import { useEffect, useRef } from "react";
import type { CopyControlProps } from "./types";

/**
 * The copy button gets a 24 px hit area without moving the layout (size-6 with a negative margin around the 16 px icon),
 * and the library icons, which hard-code #009AFF, take the theme's tokens.
 */
const COPY_CLASS = [
  "[&_button]:-m-1 [&_button]:size-6 [&_button]:p-1 [&_.copy-icon_path]:fill-klerosUIComponentsPrimaryBlue [&_.copied-icon_path]:fill-klerosUIComponentsSuccess",
  "[&_.copied-icon]:animate-[t-icon-in_var(--icon-swap-dur)_var(--icon-swap-ease)_backwards] motion-reduce:[&_.copied-icon]:animate-none",
].join(" ");
/**
 * The library's Tooltip reads `className` from these props, but Copiable's type leaves it out; `place` is its default and
 * gives the object a declared key. React-aria waits for the tooltip's animation before unmounting it, so the motion is
 * keyframes on its entering and exiting states rather than a transition. They are important because the library's own
 * fade classes stay on the tooltip and sort after them; the reduced-motion guard sits in an earlier layer, so it still wins.
 */
const TOOLTIP_PROPS = {
  place: "top" as const,
  className:
    "origin-bottom entering:animate-[t-tooltip-in_var(--tt-in-dur)_var(--tt-in-ease)_var(--tt-delay)_backwards]! exiting:animate-[t-tooltip-out_var(--tt-out-dur)_var(--tt-out-ease)_forwards]!",
};

/** The library's copy control around `children`, named `label`, with the theme's icons and motion. */
export function CopyControl({ label, content, layout, className, copiableClassName, onReach, children }: CopyControlProps) {
  const copyRef = useRef<HTMLSpanElement>(null);

  // The library's copy button wraps a bare icon and takes no label of its own, so name it after it mounts. Its tooltip
  // trigger is a second focusable `role="button"` wrapper around that button; taking it out of the Tab order and the
  // accessibility tree leaves the copy control as one Tab stop.
  useEffect(() => {
    const button = copyRef.current?.querySelector("button");
    if (button === null || button === undefined) return;
    button.setAttribute("aria-label", label);
    const trigger = button.parentElement?.closest('[role="button"][tabindex="0"]');
    if (trigger === null || trigger === undefined || !copyRef.current?.contains(trigger)) return;
    trigger.setAttribute("tabindex", "-1");
    trigger.removeAttribute("role");
  }, [label]);

  return (
    <span
      ref={copyRef}
      className={className === undefined ? `${layout} ${COPY_CLASS}` : `${layout} ${COPY_CLASS} ${className}`}
      onPointerDownCapture={onReach}
      onFocusCapture={onReach}
      onClickCapture={onReach}
    >
      <Copiable copiableContent={content} info={label} tooltipProps={TOOLTIP_PROPS} className={copiableClassName}>
        {children}
      </Copiable>
    </span>
  );
}
