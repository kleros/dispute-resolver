import { Button } from "@kleros/ui-components-library";
import { AccountMenu } from "./AccountMenu";
import type { WalletControlProps } from "./types";
import { useConnectWallet } from "./useConnectWallet";
import { useWallet } from "./useWallet";

// On a phone the chain pill beside it takes the free width, so the button gives up some of its padding.
const CONNECT_CLASS = "shrink-0 max-sm:px-4";

export function WalletControl({ chain }: WalletControlProps) {
  const wallet = useWallet();
  const connect = useConnectWallet();

  if (wallet.status === "connected") return <AccountMenu address={wallet.address} walletChainId={wallet.chainId} chain={chain} />;

  if (!connect.available) return <Button text="Connect" small isDisabled className={CONNECT_CLASS} />;

  const connecting = wallet.status === "connecting";
  return (
    <Button
      text={connecting ? "Connecting" : "Connect"}
      // The library Button hides its text while loading, which would leave the control without a name.
      aria-label={connecting ? "Connecting" : undefined}
      small
      className={CONNECT_CLASS}
      isLoading={connecting}
      isDisabled={connecting}
      onPress={() => {
        connect.open(chain.id);
      }}
    />
  );
}
