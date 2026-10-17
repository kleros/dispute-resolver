import { CHAINS } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useId } from "react";
import { Notice } from "../ui";
import { useNetworkSwitch } from "../wallet";
import type { UnsupportedNetworkScreenProps } from "./types";

/** The configured chains in ascending numeric order (spec §2.5). */
const SUPPORTED_CHAINS = Object.values(CHAINS)
  .slice()
  .sort((left, right) => left.id - right.id);

/**
 * The screen of a URL whose chain is not configured (spec §2.5). Each configured chain is a button that asks the wallet
 * to switch to it; the app then follows the wallet (D-55). A declined, failed or impossible switch is shown inline
 * (P-03). The entries never navigate: a read-only user changes chain through the URL, as today.
 */
export function UnsupportedNetworkScreen({ segment }: UnsupportedNetworkScreenProps) {
  const headingId = useId();
  const network = useNetworkSwitch();
  const { state } = network;

  return (
    <section aria-labelledby={headingId} className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 [overflow-wrap:anywhere]">
      <div className="flex flex-col gap-2 text-center">
        <h1 id={headingId} className="text-2xl font-semibold text-klerosUIComponentsPrimaryText">
          Unsupported Network {segment}
        </h1>
        <p className="text-base text-klerosUIComponentsSecondaryText">Please switch over one of the following networks.</p>
      </div>
      <ul aria-label="Supported networks" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SUPPORTED_CHAINS.map((chain) => {
          const switching = state.status === "switching" && state.chainId === chain.id;
          return (
            <li key={chain.id} className="flex">
              <Button
                className="h-auto w-full [&_p]:whitespace-normal"
                variant="secondary"
                text={`${chain.name} (${String(chain.id)})`}
                aria-label={`Switch the wallet to ${chain.name} (${String(chain.id)})`}
                isLoading={switching}
                isDisabled={state.status === "switching"}
                onPress={() => {
                  void network.switchTo(chain.id);
                }}
              />
            </li>
          );
        })}
      </ul>
      {state.status === "failed" ? <Notice variant="error" title="Network not switched" body={state.message} /> : null}
    </section>
  );
}
