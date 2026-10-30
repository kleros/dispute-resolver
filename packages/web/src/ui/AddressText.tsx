import { explorerAddressUrl } from "@dispute-resolver/core";
import { useEffect, useRef } from "react";
import { Copiable } from "@kleros/ui-components-library";
import { ExternalLink } from "../safe-content";
import { displayAddress, shortenAddress } from "./address";
import type { AddressTextProps } from "./types";

const COPY_LABEL = "Copy address";
/** A data-cell link: no underline at rest, underline on hover. */
const LINK_CLASS = "rounded-base text-klerosUIComponentsPrimaryBlue underline-offset-2 hover:underline [overflow-wrap:anywhere]";
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

/** Shortened, with the full address on hover, unless `full`. */
export function AddressText({ address, chain, className, full = false }: AddressTextProps) {
  const checksummed = displayAddress(address);
  const copyRef = useRef<HTMLSpanElement>(null);

  // The library's copy button wraps a bare icon and takes no label of its own, so name it after it mounts. Its tooltip
  // trigger is a second focusable `role="button"` wrapper around that button; taking it out of the Tab order and the
  // accessibility tree leaves the copy control as one Tab stop.
  useEffect(() => {
    const button = copyRef.current?.querySelector("button");
    if (button === null || button === undefined) return;
    button.setAttribute("aria-label", COPY_LABEL);
    const trigger = button.parentElement?.closest('[role="button"][tabindex="0"]');
    if (trigger === null || trigger === undefined || !copyRef.current?.contains(trigger)) return;
    trigger.setAttribute("tabindex", "-1");
    trigger.removeAttribute("role");
  }, []);

  const text = full ? (
    <span className="font-mono [overflow-wrap:anywhere]">{checksummed}</span>
  ) : (
    <span title={checksummed} className="font-mono">
      {shortenAddress(checksummed)}
    </span>
  );
  return (
    <span ref={copyRef} className={className === undefined ? `inline-flex ${COPY_CLASS}` : `inline-flex ${COPY_CLASS} ${className}`}>
      <Copiable copiableContent={checksummed} info={COPY_LABEL} tooltipProps={TOOLTIP_PROPS} className={full ? "min-w-0" : undefined}>
        <ExternalLink href={explorerAddressUrl(chain, address)} className={LINK_CLASS}>
          {text}
          <span className="sr-only">{`, view on ${chain.name} explorer`}</span>
        </ExternalLink>
      </Copiable>
    </span>
  );
}
