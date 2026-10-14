import type { ReactNode } from "react";
import type { CoreDeps } from "../../data";
import { TestDataProvider } from "../data";
import { TestWalletProvider } from "./TestWalletProvider";
import type { TestWallet } from "./testWallet";

/** A `wrapper` for `render`/`renderHook`: `TestDataProvider` (with `deps`) around `TestWalletProvider`. */
export function walletWrapper(wallet: TestWallet, deps?: CoreDeps) {
  return function WalletWrapper({ children }: { readonly children?: ReactNode }) {
    return (
      <TestDataProvider deps={deps}>
        <TestWalletProvider wallet={wallet}>{children}</TestWalletProvider>
      </TestDataProvider>
    );
  };
}
