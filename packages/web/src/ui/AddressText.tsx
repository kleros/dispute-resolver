import { explorerAddressUrl } from "@dispute-resolver/core";
import { ExternalLink } from "../safe-content";
import { displayAddress, shortenAddress } from "./address";
import { CopyControl } from "./CopyControl";
import type { AddressTextProps } from "./types";

/** A data-cell link: no underline at rest, underline on hover. */
const LINK_CLASS = "rounded-base text-klerosUIComponentsPrimaryBlue underline-offset-2 hover:underline [overflow-wrap:anywhere]";

/** Shortened, with the full address on hover, unless `full`. */
export function AddressText({ address, chain, className, full = false }: AddressTextProps) {
  const checksummed = displayAddress(address);
  const text = full ? (
    <span className="font-mono [overflow-wrap:anywhere]">{checksummed}</span>
  ) : (
    <span title={checksummed} className="font-mono">
      {shortenAddress(checksummed)}
    </span>
  );
  return (
    <CopyControl label="Copy address" content={checksummed} layout="inline-flex" className={className} copiableClassName={full ? "min-w-0" : undefined}>
      <ExternalLink href={explorerAddressUrl(chain, address)} className={LINK_CLASS}>
        {text}
        <span className="sr-only">{`, view on ${chain.name} explorer`}</span>
      </ExternalLink>
    </CopyControl>
  );
}
