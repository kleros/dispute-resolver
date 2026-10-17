import { explorerAddressUrl } from "@dispute-resolver/core";
import { useEffect, useRef } from "react";
import { Copiable } from "@kleros/ui-components-library";
import { ExternalLink } from "../safe-content";
import { displayAddress, shortenAddress } from "./address";
import type { AddressTextProps } from "./types";

const COPY_LABEL = "Copy address";
/** A data-cell link (contract §5 b): no underline at rest, underline on hover. */
const LINK_CLASS = "rounded-base text-klerosUIComponentsPrimaryBlue underline-offset-2 hover:underline [overflow-wrap:anywhere]";
/**
 * The copy button gets a 24 px hit area without moving the layout (size-6 with a negative margin around the 16 px icon),
 * and the library icons, which hard-code #009AFF, take the theme's tokens.
 */
const COPY_CLASS =
  "[&_button]:-m-1 [&_button]:size-6 [&_button]:p-1 [&_.copy-icon_path]:fill-klerosUIComponentsPrimaryBlue [&_.copied-icon_path]:fill-klerosUIComponentsSuccess";

/**
 * A shortened address (full address on hover) with the library `Copiable` and, when the chain has an explorer, a link to
 * the address on it (D-40).
 */
export function AddressText({ address, chain, className }: AddressTextProps) {
  const full = displayAddress(address);
  const short = shortenAddress(full);
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

  const text = (
    <span title={full} className="font-mono">
      {short}
    </span>
  );
  const explorer = explorerAddressUrl(chain, address);
  return (
    <span ref={copyRef} className={className === undefined ? `inline-flex ${COPY_CLASS}` : `inline-flex ${COPY_CLASS} ${className}`}>
      <Copiable copiableContent={full} info={COPY_LABEL}>
        {explorer === null ? (
          text
        ) : (
          <ExternalLink href={explorer} className={LINK_CLASS}>
            {text}
            <span className="sr-only">{`, view on ${chain.name} explorer`}</span>
          </ExternalLink>
        )}
      </Copiable>
    </span>
  );
}
