import type { ChainId } from "@dispute-resolver/core";
import { getAccount, switchChain, type Config } from "@wagmi/core";
import { useCallback, useState } from "react";
import { useConfig } from "wagmi";
import { chainName } from "./chains";
import { errorMessage, isUserRejection } from "./errors";

/** How a switch request ended (P-03). */
export type SwitchResult = { readonly ok: true } | { readonly ok: false; readonly reason: "no-wallet" | "rejected" | "failed"; readonly message: string };

/**
 * Asks the connected wallet to change to `chainId` through wagmi, which offers `wallet_addEthereumChain` when the
 * wallet does not know the chain (P-03). Never throws: no wallet, a rejection and any failure are results to show.
 */
export async function switchWalletChain(config: Config, chainId: ChainId): Promise<SwitchResult> {
  const name = chainName(chainId);
  if (getAccount(config).status !== "connected") {
    return { ok: false, reason: "no-wallet", message: `Connect a wallet to switch to ${name}.` };
  }
  try {
    await switchChain(config, { chainId });
    return { ok: true };
  } catch (error) {
    if (isUserRejection(error)) return { ok: false, reason: "rejected", message: `The switch to ${name} was declined in the wallet.` };
    return { ok: false, reason: "failed", message: `Could not switch to ${name}: ${errorMessage(error)}` };
  }
}

export type NetworkSwitchState =
  { readonly status: "idle" } | { readonly status: "switching"; readonly chainId: ChainId } | { readonly status: "failed"; readonly chainId: ChainId; readonly message: string };

export interface NetworkSwitch {
  readonly state: NetworkSwitchState;
  /** Resolves `true` once the wallet is on `chainId`; otherwise the failure is in `state` for an inline message (P-03). */
  switchTo(chainId: ChainId): Promise<boolean>;
  reset(): void;
}

const IDLE: NetworkSwitchState = { status: "idle" };

/** The switch flow of P-03 for any control that asks the wallet to change chain. */
export function useNetworkSwitch(): NetworkSwitch {
  const config = useConfig();
  const [state, setState] = useState<NetworkSwitchState>(IDLE);
  const switchTo = useCallback(
    async (chainId: ChainId) => {
      setState({ status: "switching", chainId });
      const result = await switchWalletChain(config, chainId);
      setState(result.ok ? IDLE : { status: "failed", chainId, message: result.message });
      return result.ok;
    },
    [config],
  );
  const reset = useCallback(() => {
    setState(IDLE);
  }, []);
  return { state, switchTo, reset };
}
