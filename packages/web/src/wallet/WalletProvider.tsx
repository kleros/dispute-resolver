import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { WalletSetupContext } from "./context";
import { walletSetupFor } from "./setup";
import type { WalletProviderProps, WalletSetup } from "./types";

export interface WalletSetupProviderProps {
  readonly setup: WalletSetup;
  /** Wagmi's silent reconnect of a previously authorized connector at mount; default `true` (D-06). */
  readonly reconnectOnMount?: boolean;
  readonly children?: ReactNode;
}

/**
 * Wagmi plus the wallet setup, for an already created setup. Wagmi reconnects a previously authorized connector
 * silently and never requests accounts, so nothing prompts at load (D-06). Needs a TanStack `QueryClientProvider` above
 * it (`DataProvider`, ARCHITECTURE.md §2.1).
 */
export function WalletSetupProvider({ setup, reconnectOnMount = true, children }: WalletSetupProviderProps) {
  return (
    <WagmiProvider config={setup.wagmiConfig} reconnectOnMount={reconnectOnMount}>
      <WalletSetupContext.Provider value={setup}>{children}</WalletSetupContext.Provider>
    </WagmiProvider>
  );
}

/** The app's wallet provider (ARCHITECTURE.md §2.1, §2.3): creates the setup of `config` once, on first render. */
export function WalletProvider({ config, children }: WalletProviderProps) {
  return <WalletSetupProvider setup={walletSetupFor(config)}>{children}</WalletSetupProvider>;
}
