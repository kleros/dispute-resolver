import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TestDataProvider } from "../test/data";
import { createTestWallet, walletWrapper } from "../test/wallet";
import { useWriteAccess } from "./useWriteAccess";
import { WalletSetupProvider } from "./WalletProvider";

describe("useWriteAccess", () => {
  it("reports needs-wallet while no wallet is connected or while it reconnects", () => {
    const disconnected = renderHook(() => useWriteAccess(1), { wrapper: walletWrapper(createTestWallet()) });
    expect(disconnected.result.current).toEqual({ status: "needs-wallet", guard: { phase: "needs-wallet", pageChainId: 1 } });

    const returning = createTestWallet();
    const reconnecting = renderHook(() => useWriteAccess(100), {
      wrapper: ({ children }: { readonly children?: ReactNode }) => (
        <TestDataProvider>
          <WalletSetupProvider setup={returning.setup} pending pendingReconnect>
            {children}
          </WalletSetupProvider>
        </TestDataProvider>
      ),
    });
    expect(reconnecting.result.current).toEqual({ status: "needs-wallet", guard: { phase: "needs-wallet", pageChainId: 100 } });
  });

  it("reports ready for a wallet connected on the page chain", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    const { result } = renderHook(() => useWriteAccess(100), { wrapper: walletWrapper(wallet) });
    await act(() => wallet.connect());
    expect(result.current).toEqual({ status: "ready" });
  });

  it("reports wrong-chain with the wallet's and the page's chains when they differ", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    const { result } = renderHook(() => useWriteAccess(1), { wrapper: walletWrapper(wallet) });
    expect(result.current).toEqual({ status: "wrong-chain", guard: { phase: "wrong-chain", walletChainId: 100, pageChainId: 1 } });
  });
});
