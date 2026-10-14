import { createContext, useContext } from "react";
import type { WalletSetup } from "./types";

export const WalletSetupContext = createContext<WalletSetup | null>(null);

/** The setup of the enclosing `WalletProvider` (or `WalletSetupProvider`). */
export function useWalletSetup(): WalletSetup {
  const setup = useContext(WalletSetupContext);
  if (setup === null) throw new Error("Wallet hooks must be used inside WalletProvider.");
  return setup;
}
