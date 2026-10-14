import type { ChainId } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { ExternalLink } from "../safe-content";
import { Notice } from "../ui";
import { chainName } from "./chains";
import { useNetworkSwitch } from "./switchChain";
import type { WriteStatusNoticeProps } from "./types";
import { CONNECT_UNAVAILABLE_MESSAGES, useConnectWallet } from "./useConnectWallet";
import { useWallet } from "./useWallet";
import { writeMessage } from "./writeMessages";

function SwitchOffer({ pageChainId }: { readonly pageChainId: ChainId }) {
  const wallet = useWallet();
  const network = useNetworkSwitch();
  if (wallet.status === "connected" && wallet.chainId === pageChainId) {
    return <p className="text-sm">Your wallet is now on {chainName(pageChainId)}. Try again.</p>;
  }
  const switching = network.state.status === "switching";
  return (
    <div className="flex flex-col gap-2">
      <Button
        text={`Switch to ${chainName(pageChainId)}`}
        small
        className="self-start"
        isLoading={switching}
        isDisabled={switching}
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

function ConnectOffer({ pageChainId }: { readonly pageChainId: ChainId | undefined }) {
  const wallet = useWallet();
  const connect = useConnectWallet();
  if (wallet.status === "connected") return <p className="text-sm">Wallet connected. Try again.</p>;
  if (connect.unavailableReason !== null) return <p className="text-sm">{CONNECT_UNAVAILABLE_MESSAGES[connect.unavailableReason]}</p>;
  return (
    <Button
      text="Connect"
      small
      className="self-start"
      onPress={() => {
        connect.open(pageChainId);
      }}
    />
  );
}

/**
 * Any `WriteStatus` as a library alert (ARCHITECTURE.md §6.1, D-14), placed next to the action: the explorer link of a
 * submitted, mined or failed transaction (D-40), the switch offer of a wrong chain (B3, D-48, P-03) and the connect
 * offer when no wallet is connected. A rejected signature is a neutral notice (D-07). `idle` renders nothing.
 */
export function WriteStatusNotice({ status, progress, className }: WriteStatusNoticeProps) {
  if (status.phase === "idle") return null;
  const message = writeMessage(status);
  const title = progress === undefined || progress.total < 2 ? message.title : `${message.title} (${String(progress.index + 1)} of ${String(progress.total)})`;
  const explorerUrl = "explorerUrl" in status ? status.explorerUrl : null;
  return (
    <div className={className === undefined ? "flex flex-col gap-2" : `flex flex-col gap-2 ${className}`} aria-live="polite">
      <Notice variant={message.variant} title={title} body={message.body} />
      {explorerUrl === null ? null : <ExternalLink href={explorerUrl}>View the transaction on the block explorer</ExternalLink>}
      {status.phase === "wrong-chain" ? <SwitchOffer pageChainId={status.pageChainId} /> : null}
      {status.phase === "needs-wallet" ? <ConnectOffer pageChainId={status.pageChainId} /> : null}
    </div>
  );
}
