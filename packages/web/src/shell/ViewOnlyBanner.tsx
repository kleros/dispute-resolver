import { ExternalLink } from "../safe-content";
import { CONNECT_UNAVAILABLE_MESSAGES, useConnectWallet } from "../wallet";
import { CONTENT, GUTTER } from "./layout";

/**
 * spec §2.3: shown while no wallet is connected. When a wallet can connect, the wording says "connect a wallet" now
 * that any wallet connects on demand (D-06), and the Metamask link is kept. When none can (K-02, K-03), it says why
 * instead of pointing at a wallet the deployment cannot connect.
 */
export function ViewOnlyBanner() {
  const { unavailableReason } = useConnectWallet();
  return (
    <div role="note" aria-label="View mode only" className={`border-b border-klerosUIComponentsStroke bg-klerosUIComponentsMediumBlue ${GUTTER}`}>
      <p className={`${CONTENT} py-3 text-sm text-klerosUIComponentsPrimaryText`}>
        <span className="font-semibold">View mode only:</span> Actions that require an Ethereum account are disabled.{" "}
        {unavailableReason === null ? (
          <>
            To use them, connect a wallet such as <ExternalLink href="https://metamask.io">Metamask</ExternalLink>.
          </>
        ) : (
          CONNECT_UNAVAILABLE_MESSAGES[unavailableReason]
        )}
      </p>
    </div>
  );
}
