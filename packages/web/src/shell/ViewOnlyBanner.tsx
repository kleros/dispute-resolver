import { ExternalLink } from "../safe-content";
import { useConnectWallet } from "../wallet";
import { CONTENT, GUTTER } from "./layout";

export function ViewOnlyBanner() {
  const { available } = useConnectWallet();
  return (
    <div role="note" aria-label="View mode only" className={`border-b border-klerosUIComponentsStroke bg-klerosUIComponentsMediumBlue ${GUTTER}`}>
      <p className={`${CONTENT} py-3 text-sm text-klerosUIComponentsPrimaryText`}>
        <span className="font-semibold">View mode only:</span> Actions that require an Ethereum account are disabled.
        {available ? (
          <>
            {" "}
            To use them, connect a wallet such as <ExternalLink href="https://metamask.io">Metamask</ExternalLink>.
          </>
        ) : null}
      </p>
    </div>
  );
}
