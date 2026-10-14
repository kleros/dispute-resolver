import type { ReactNode } from "react";
import { WalletSetupProvider } from "../../wallet";
import type { TestWallet } from "./testWallet";

export interface TestWalletProviderProps {
  readonly wallet: TestWallet;
  readonly children?: ReactNode;
}

/**
 * The wallet layer over a `createTestWallet` wallet (ARCHITECTURE.md §1.5). No reconnect at mount: the test connects
 * the wallet itself (`await wallet.connect()`), before or after rendering. Needs `TestDataProvider` above it.
 */
export function TestWalletProvider({ wallet, children }: TestWalletProviderProps) {
  return (
    <WalletSetupProvider setup={wallet.setup} reconnectOnMount={false}>
      {children}
    </WalletSetupProvider>
  );
}
