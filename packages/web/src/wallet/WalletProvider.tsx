import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { WalletSetupContext } from "./context";
import { walletSetupStoreFor } from "./setup";
import type { WalletProviderProps, WalletSetup } from "./types";

export interface WalletSetupProviderProps {
  readonly setup: WalletSetup;
  /** `true` while AppKit is still loading: nothing reconnects yet. Default `false`. */
  readonly pending?: boolean;
  /** `true` when, while `pending`, a stored connection waits for AppKit: the wallet reads as `connecting`. Default `false`. */
  readonly pendingReconnect?: boolean;
  readonly children?: ReactNode;
}

/**
 * Wagmi plus the wallet setup, for an already created setup. Wagmi reconnects a previously authorized connector
 * silently and never requests accounts, so nothing prompts at load (D-06). A new `setup` keeps the tree mounted: wagmi's
 * hooks follow the new config and wagmi hydrates it, reconnecting then. Needs a TanStack `QueryClientProvider` above it
 * (`DataProvider`, ARCHITECTURE.md §2.1). Tests render it over their own setup (`src/test/wallet`).
 */
export function WalletSetupProvider({ setup, pending = false, pendingReconnect = false, children }: WalletSetupProviderProps) {
  const state = useMemo(() => ({ setup, pending, pendingReconnect }), [setup, pending, pendingReconnect]);
  return (
    <WagmiProvider config={setup.wagmiConfig} reconnectOnMount={!pending}>
      <WalletSetupContext.Provider value={state}>{children}</WalletSetupContext.Provider>
    </WagmiProvider>
  );
}

/**
 * The app's wallet provider (ARCHITECTURE.md §2.1, §2.3). The page renders at once with the setup store's current
 * setup; once mounted it starts loading AppKit, so the first paint never waits for the wallet stack, and the tree
 * moves to the AppKit setup when it is created.
 */
export function WalletProvider({ config, children }: WalletProviderProps) {
  const store = walletSetupStoreFor(config);
  const { setup, pending, pendingReconnect } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    // A failed load leaves the app read-only, the outcome of declining a connection (D-06); Connect retries it.
    store.load().catch(() => undefined);
  }, [store]);
  return (
    <WalletSetupProvider setup={setup} pending={pending} pendingReconnect={pendingReconnect}>
      {children}
    </WalletSetupProvider>
  );
}
