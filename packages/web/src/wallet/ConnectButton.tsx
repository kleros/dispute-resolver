import { Button } from "@kleros/ui-components-library";
import { useConnectWallet } from "./useConnectWallet";

export function ConnectButton({ chainId }: { readonly chainId: number | undefined }) {
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
