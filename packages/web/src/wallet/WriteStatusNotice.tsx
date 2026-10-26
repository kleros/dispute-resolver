import { Button } from "@kleros/ui-components-library";
import { ExternalLink } from "../safe-content";
import { Notice } from "../ui";
import { chainName } from "./chains";
import { ConnectButton } from "./ConnectButton";
import { useNetworkSwitch, type NetworkSwitch } from "./switchChain";
import type { WriteStatusNoticeProps } from "./types";
import { useWallet } from "./useWallet";
import { writeMessage } from "./writeMessages";

function SwitchOffer({ pageChainId, network }: { readonly pageChainId: number; readonly network: NetworkSwitch }) {
  const wallet = useWallet();
  if (wallet.status === "connected" && wallet.chainId === pageChainId) {
    return <p className="text-sm">Your wallet is now on {chainName(pageChainId)}. Try again.</p>;
  }
  // Any waiting request, whatever its chain, replaces the button: the wallet answers one request at a time.
  if (network.state.status === "switching") {
    return <p className="text-sm">A switch to {chainName(network.state.chainId)} is waiting in your wallet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        text={`Switch to ${chainName(pageChainId)}`}
        small
        className="self-start"
        onPress={() => {
          void network.switchTo(pageChainId);
        }}
      />
      {network.state.status === "failed" ? (
        <p role="alert" className="text-sm text-klerosUIComponentsError">
          {network.state.message}
        </p>
      ) : null}
    </div>
  );
}

function ConnectOffer({ pageChainId }: { readonly pageChainId: number | undefined }) {
  const wallet = useWallet();
  if (wallet.status === "connected") return <p className="text-sm">Wallet connected. Try again.</p>;
  return <ConnectButton chainId={pageChainId} />;
}

/** A rejected signature is a neutral notice, not an error. */
export function WriteStatusNotice({ status, progress, beforeAttempt = false, className }: WriteStatusNoticeProps) {
  const network = useNetworkSwitch();
  if (status.phase === "idle") return null;
  const message = writeMessage(status, { beforeAttempt, switching: network.state.status === "switching" });
  const title = progress === undefined || progress.total < 2 ? message.title : `${message.title} (${String(progress.index + 1)} of ${String(progress.total)})`;
  const explorerUrl = "explorerUrl" in status ? status.explorerUrl : null;
  return (
    <div className={className === undefined ? "flex flex-col gap-2" : `flex flex-col gap-2 ${className}`} aria-live="polite">
      <Notice reveal variant={message.variant} title={title} body={message.body} />
      {explorerUrl === null ? null : <ExternalLink href={explorerUrl}>View the transaction on the block explorer</ExternalLink>}
      {status.phase === "wrong-chain" ? <SwitchOffer pageChainId={status.pageChainId} network={network} /> : null}
      {status.phase === "needs-wallet" ? <ConnectOffer pageChainId={status.pageChainId} /> : null}
    </div>
  );
}
