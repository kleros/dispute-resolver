import { Button } from "@kleros/ui-components-library";
import { useWalletSetup } from "./context";
import type { ChainIndicatorProps } from "./types";
import { useNetworkSwitch } from "./switchChain";
import { useWallet } from "./useWallet";

const NAME_CLASS = "truncate text-sm font-semibold";
/** A 10 % tint of the bar's own text under the dot and the static name (white on it 8.90:1 light, PrimaryText 10.34:1 dark). */
const PLATE_CLASS = "inline-flex h-8 min-w-0 items-center gap-2 rounded-full bg-current/10 px-3";

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
  const appKitName = connected && setup.mode === "appkit" && !offerSwitch;
  // The plate (contract §12) holds the dot and a static name only: never a button, never beside the switch.
  const plated = !offerSwitch && !appKitName;
  if (appKitName) {
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

  // The dot sits on the purple bar, so it takes the bar's status shades (contract §5). On the fallback chain (the URL
  // names no supported chain) it is neutral: the bar's own text at half strength, never the connected green.
  let dotTone = "bg-(--dr-success-bar)";
  if (offerSwitch) {
    dotTone = "bg-(--dr-warning-bar)";
  } else if (!isPageChain) {
    dotTone = "bg-current/50";
  }
  const dot = <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dotTone}`} />;

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div className="flex min-w-0 items-center gap-2">
        {plated ? (
          <span className={PLATE_CLASS}>
            {dot}
            {name}
          </span>
        ) : (
          <>
            {dot}
            {name}
          </>
        )}
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
        <p role="alert" className="max-w-xs text-right text-sm">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
