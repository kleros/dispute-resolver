import { Button } from "@kleros/ui-components-library";
import { useConnectWallet } from "./useConnectWallet";

export function ConnectButton({ chainId, variant = "primary" }: { readonly chainId: number | undefined; readonly variant?: "primary" | "secondary" }) {
  const connect = useConnectWallet();
  if (!connect.available) return null;
  return (
    <Button
      text="Connect"
      small
      variant={variant}
      className="self-start"
      onPress={() => {
        connect.open(chainId);
      }}
    />
  );
}
