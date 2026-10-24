import type { ReactNode } from "react";
import { WalletSetupProvider } from "../../wallet";
import type { TestWallet } from "./testWallet";

export interface TestWalletProviderProps {
  readonly wallet: TestWallet;
  readonly children?: ReactNode;
}

/**
 * The wallet layer over a `createTestWallet` wallet. Rendered `pending`, whose only effect without `pendingReconnect`
 * is that wagmi does not reconnect at mount: the test connects the wallet itself (`await wallet.connect()`), before or
 * after rendering. Needs `TestDataProvider` above it.
 */
export function TestWalletProvider({ wallet, children }: TestWalletProviderProps) {
  return (
    <WalletSetupProvider setup={wallet.setup} pending>
      {children}
    </WalletSetupProvider>
  );
}
