import { Button } from "@kleros/ui-components-library";
import { useWalletSetup } from "./context";
import type { ChainIndicatorProps } from "./types";
import { useNetworkSwitch } from "./switchChain";
import { useWallet } from "./useWallet";

const NAME_CLASS = "truncate text-sm font-semibold";

/**
 * The header's chain (ARCHITECTURE.md §11.2): the resolved chain's name. A wallet connected on another chain than the
 * page is offered the switch to the page chain (D-48), with any failure shown inline (P-03). In the AppKit mode the name
 * of a connected wallet's chain opens AppKit's Networks view, which changes the wallet's chain; the app follows (D-55).
 * It never navigates by itself.
 */
export function ChainIndicator({ chain, isPageChain }: ChainIndicatorProps) {
  const setup = useWalletSetup();
  const wallet = useWallet();
  const network = useNetworkSwitch();
  const connected = wallet.status === "connected";
  const offerSwitch = connected && isPageChain && wallet.chainId !== chain.id;
  const switching = network.state.status === "switching";
  const failure = network.state.status === "failed" ? network.state.message : null;

  let name = <span className={NAME_CLASS}>{chain.name}</span>;
  if (connected && setup.mode === "appkit" && !offerSwitch) {
    const { modal } = setup;
    name = (
      <Button
        text={chain.name}
        variant="tertiary"
        small
        aria-label={`Network: ${chain.name}. Change the wallet's network`}
        onPress={() => {
          modal.openNetworks().catch(() => undefined);
        }}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${offerSwitch ? "bg-klerosUIComponentsWarning" : "bg-klerosUIComponentsSuccess"}`} />
        {name}
        {offerSwitch ? (
          <Button
            text={`Switch to ${chain.name}`}
            small
            isLoading={switching}
            isDisabled={switching}
            onPress={() => {
              void network.switchTo(chain.id);
            }}
          />
        ) : null}
      </div>
      {offerSwitch && failure !== null ? (
        <p role="alert" className="max-w-xs text-right text-xs">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
