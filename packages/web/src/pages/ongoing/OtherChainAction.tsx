import type { ChainConfig, ChainId } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useLocation, useNavigate } from "react-router";
import { SWITCHABLE_CHAINS, switchChainSegment } from "../../routing";
import { Notice } from "../../ui";
import { switchingLabel, useNetworkSwitch, useWallet } from "../../wallet";

// The library's button text never wraps (`whitespace-pre`); "View disputes on Ethereum Mainnet" must, at 320 px.
const BUTTON_CLASS = "h-auto max-w-full [&_p]:whitespace-normal";

/** The header pill's other production chain; a testnet page, reached by URL alone, is offered Ethereum Mainnet. */
export function otherSwitchableChain(pageChainId: ChainId): ChainConfig | undefined {
  return SWITCHABLE_CHAINS.find((chain) => chain.id !== pageChainId);
}

/**
 * Opens the Ongoing page of `target` the way the header's network pill does: a wallet connected on another chain is
 * asked to switch and the page follows it; otherwise the page moves, keeping the rest of the address. This button's own
 * switch flow is not the header's, so a refusal is said here rather than under the pill.
 */
export function OtherChainAction({ target }: { readonly target: ChainConfig }) {
  const wallet = useWallet();
  const network = useNetworkSwitch();
  const location = useLocation();
  const navigate = useNavigate();
  const switching = network.state.status === "switching";
  const walletChainId = wallet.status === "connected" ? wallet.chainId : undefined;

  const choose = () => {
    if (walletChainId !== undefined && walletChainId !== target.id) {
      void network.switchTo(target.id);
      return;
    }
    void navigate({ pathname: switchChainSegment(location.pathname, target.id), search: location.search, hash: location.hash });
  };

  return (
    <>
      <Button
        variant="secondary"
        small
        className={BUTTON_CLASS}
        text={`View disputes on ${target.name}`}
        aria-label={switchingLabel(network.state)}
        isLoading={switching}
        isDisabled={switching}
        onPress={choose}
      />
      {network.state.status === "failed" ? <Notice reveal variant="error" title="Network not switched" body={network.state.message} className="w-full text-left" /> : null}
    </>
  );
}
