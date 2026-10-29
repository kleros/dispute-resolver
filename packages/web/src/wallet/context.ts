import { createContext, useContext } from "react";
import type { WalletSetup, WalletSetupState } from "./types";

export const WalletSetupContext = createContext<WalletSetupState | null>(null);

function useWalletSetupState(): WalletSetupState {
  const state = useContext(WalletSetupContext);
  if (state === null) throw new Error("Wallet hooks must be used inside WalletProvider.");
  return state;
}

export function useWalletSetup(): WalletSetup {
  return useWalletSetupState().setup;
}

export function useWalletSetupPendingReconnect(): boolean {
  const { pending, pendingReconnect } = useWalletSetupState();
  return pending && pendingReconnect;
}
