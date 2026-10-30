import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { WalletSetupContext } from "./context";
import { walletSetupStoreFor } from "./setup";
import type { WalletProviderProps, WalletSetup } from "./types";

interface WalletSetupProviderProps {
  readonly setup: WalletSetup;
  readonly pending?: boolean;
  readonly pendingReconnect?: boolean;
  readonly children?: ReactNode;
}

/**
 * Wagmi reconnects a previously authorized connector silently and never requests accounts, so nothing prompts at load.
 * A new `setup` keeps the tree mounted: wagmi's hooks follow the new config and wagmi hydrates it, reconnecting then.
 * Needs a TanStack `QueryClientProvider` above it.
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
 * The page renders at once with the setup store's current setup and starts loading AppKit only once mounted, so the
 * first paint never waits for the wallet stack.
 */
export function WalletProvider({ config, children }: WalletProviderProps) {
  const store = walletSetupStoreFor(config);
  const { setup, pending, pendingReconnect } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    // A failed load leaves the app read-only, as declining a connection does; Connect retries it.
    store.load().catch(() => undefined);
  }, [store]);
  return (
    <WalletSetupProvider setup={setup} pending={pending} pendingReconnect={pendingReconnect}>
      {children}
    </WalletSetupProvider>
  );
}
