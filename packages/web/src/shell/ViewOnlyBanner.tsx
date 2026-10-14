import { ExternalLink } from "../safe-content";
import { CONTENT, GUTTER } from "./layout";

/**
 * spec §2.3: shown while no wallet is connected. The wording says "connect a wallet" now that any wallet connects on
 * demand (D-06); the Metamask link is kept.
 */
export function ViewOnlyBanner() {
  return (
    <div role="note" aria-label="View mode only" className={`border-b border-klerosUIComponentsStroke bg-klerosUIComponentsMediumBlue ${GUTTER}`}>
      <p className={`${CONTENT} py-3 text-sm text-klerosUIComponentsPrimaryText`}>
        <span className="font-semibold">View mode only:</span> Actions that require an Ethereum account are disabled. To use them, connect a wallet such as{" "}
        <ExternalLink href="https://metamask.io">Metamask</ExternalLink>.
      </p>
    </div>
  );
}
