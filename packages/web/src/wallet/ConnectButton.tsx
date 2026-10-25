import type { ChainId } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useConnectWallet } from "./useConnectWallet";

/** Opens the Connect view on `chainId`; renders nothing where no wallet can be connected. */
export function ConnectButton({ chainId }: { readonly chainId: ChainId | undefined }) {
  const connect = useConnectWallet();
  if (!connect.available) return null;
  return (
    <Button
      text="Connect"
      small
      className="self-start"
      onPress={() => {
        connect.open(chainId);
      }}
    />
  );
}
