import { useId } from "react";
import { Button } from "@kleros/ui-components-library";
import { AccountMenu } from "./AccountMenu";
import type { WalletControlProps } from "./types";
import { CONNECT_UNAVAILABLE_LABELS, CONNECT_UNAVAILABLE_MESSAGES, useConnectWallet } from "./useConnectWallet";
import { useWallet } from "./useWallet";

/**
 * The header's wallet control (ARCHITECTURE.md §11.2): Connect while disconnected, the account menu once connected.
 * Without a project ID (K-02), or once AppKit turns out to hold an embedded-wallet connector (K-03), Connect is disabled
 * with a short label beside it and the reason as its description; the app stays read-only.
 */
export function WalletControl({ chain }: WalletControlProps) {
  const wallet = useWallet();
  const connect = useConnectWallet();
  const noteId = useId();

  if (wallet.status === "connected") return <AccountMenu address={wallet.address} walletChainId={wallet.chainId} chain={chain} />;

  if (connect.unavailableReason !== null) {
    // The header has room for a short label only; the full sentence is the button's description and the view-only
    // banner's text.
    return (
      <div className="flex items-center gap-2 whitespace-nowrap">
        <Button text="Connect" small isDisabled aria-describedby={noteId} />
        <span aria-hidden="true" className="text-xs opacity-85">
          {CONNECT_UNAVAILABLE_LABELS[connect.unavailableReason]}
        </span>
        <span id={noteId} className="sr-only">
          {CONNECT_UNAVAILABLE_MESSAGES[connect.unavailableReason]}
        </span>
      </div>
    );
  }

  const connecting = wallet.status === "connecting";
  return (
    <Button
      text={connecting ? "Connecting" : "Connect"}
      small
      isLoading={connecting}
      isDisabled={connecting}
      onPress={() => {
        connect.open(chain.id);
      }}
    />
  );
}
