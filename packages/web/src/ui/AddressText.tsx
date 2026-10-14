import { explorerAddressUrl } from "@dispute-resolver/core";
import { useEffect, useRef } from "react";
import { Copiable } from "@kleros/ui-components-library";
import { ExternalLink } from "../safe-content";
import { displayAddress, shortenAddress } from "./address";
import type { AddressTextProps } from "./types";

const COPY_LABEL = "Copy address";

/**
 * A shortened address (full address on hover) with the library `Copiable` and, when the chain has an explorer, a link to
 * the address on it (D-40).
 */
export function AddressText({ address, chain, className }: AddressTextProps) {
  const full = displayAddress(address);
  const short = shortenAddress(full);
  const copyRef = useRef<HTMLSpanElement>(null);

  // The library's copy button wraps a bare icon and takes no label of its own, so name it after it mounts.
  useEffect(() => {
    copyRef.current?.querySelector("button")?.setAttribute("aria-label", COPY_LABEL);
  }, []);

  const text = (
    <span title={full} className="font-mono">
      {short}
    </span>
  );
  const explorer = explorerAddressUrl(chain, address);
  return (
    <span ref={copyRef} className={className === undefined ? "inline-flex" : `inline-flex ${className}`}>
      <Copiable copiableContent={full} info={COPY_LABEL}>
        {explorer === null ? (
          text
        ) : (
          <ExternalLink href={explorer}>
            {text}
            <span className="sr-only">{`, view on ${chain.name} explorer`}</span>
          </ExternalLink>
        )}
      </Copiable>
    </span>
  );
}
