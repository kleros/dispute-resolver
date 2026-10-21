import { useId } from "react";
import { Button } from "@kleros/ui-components-library";
import { AccountMenu } from "./AccountMenu";
import type { WalletControlProps } from "./types";
import { useConnectWallet } from "./useConnectWallet";
import { useWallet } from "./useWallet";

/**
 * The header's wallet control (ARCHITECTURE.md §11.2): Connect while disconnected, the account menu once connected.
 * Without a project ID (K-02), or once AppKit turns out to hold an embedded-wallet connector (K-03), Connect is disabled
 * and the app stays read-only.
 */
export function WalletControl({ chain }: WalletControlProps) {
  const wallet = useWallet();
  const connect = useConnectWallet();
  const noteId = useId();

  if (wallet.status === "connected") return <AccountMenu address={wallet.address} walletChainId={wallet.chainId} chain={chain} />;

  if (!connect.available) {
    return (
      <>
        <Button text="Connect" small isDisabled aria-describedby={noteId} />
        <span id={noteId} className="sr-only">
          Wallet connection is unavailable.
        </span>
      </>
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
