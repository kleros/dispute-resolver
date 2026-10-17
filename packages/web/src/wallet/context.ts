import { createContext, useContext } from "react";
import type { WalletSetup, WalletSetupState } from "./types";

export const WalletSetupContext = createContext<WalletSetupState | null>(null);

function useWalletSetupState(): WalletSetupState {
  const state = useContext(WalletSetupContext);
  if (state === null) throw new Error("Wallet hooks must be used inside WalletProvider.");
  return state;
}

/** The setup of the enclosing `WalletProvider` (or `WalletSetupProvider`). */
export function useWalletSetup(): WalletSetup {
  return useWalletSetupState().setup;
}

/** `true` while AppKit is still loading and a stored connection waits for it (`WalletSetupState.pendingReconnect`). */
export function useWalletSetupPendingReconnect(): boolean {
  const { pending, pendingReconnect } = useWalletSetupState();
  return pending && pendingReconnect;
}
