import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestDataProvider } from "../test/data";
import { TEST_WALLET_ADDRESS, UNCONFIGURED_CHAIN_ID, createTestWallet, walletWrapper } from "../test/wallet";
import { toWalletState, useWallet } from "./useWallet";
import { WalletSetupProvider } from "./WalletProvider";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toWalletState", () => {
  it("a reconnecting wallet is still connecting, so routing waits for the reconnect to settle", () => {
    expect(toWalletState("appkit", "reconnecting", "0x00000000000000000000000000000000000A11cE", 1)).toEqual({ status: "connecting", mode: "appkit" });
  });

  it("a connected address is lowercased", () => {
    expect(toWalletState("appkit", "connected", "0x00000000000000000000000000000000000A11cE", 100)).toEqual({
      status: "connected",
      mode: "appkit",
      address: TEST_WALLET_ADDRESS,
      chainId: 100,
      isConfiguredChain: true,
    });
  });

  it("a wallet on a chain outside the configured ones is connected but not on a configured chain", () => {
    expect(toWalletState("appkit", "connected", "0x00000000000000000000000000000000000A11cE", UNCONFIGURED_CHAIN_ID)).toEqual(
      expect.objectContaining({ isConfiguredChain: false }),
    );
  });

  it("carries the unconfigured mode", () => {
    expect(toWalletState("unconfigured", "disconnected", undefined, undefined)).toEqual({ status: "disconnected", mode: "unconfigured" });
  });
});

describe("useWallet", () => {
  function renderWhileAppKitLoads(pendingReconnect: boolean) {
    const wallet = createTestWallet();
    return renderHook(() => useWallet(), {
      wrapper: ({ children }: { readonly children?: ReactNode }) => (
        <TestDataProvider>
          <WalletSetupProvider setup={wallet.setup} pending pendingReconnect={pendingReconnect}>
            {children}
          </WalletSetupProvider>
        </TestDataProvider>
      ),
    });
  }

  it("while AppKit loads a returning wallet is connecting, so routing waits as it does for wagmi's reconnect", () => {
    expect(renderWhileAppKitLoads(true).result.current).toEqual({ status: "connecting", mode: "appkit" });
  });

  it("while AppKit loads a visitor with no stored connection is disconnected, so routing does not wait for AppKit", () => {
    expect(renderWhileAppKitLoads(false).result.current).toEqual({ status: "disconnected", mode: "appkit" });
  });

  it("the app loads disconnected and nothing is requested from a wallet", () => {
    const wallet = createTestWallet();
    const { result } = renderHook(() => useWallet(), { wrapper: walletWrapper(wallet) });
    expect(result.current).toEqual({ status: "disconnected", mode: "appkit" });
    expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
  });

  it("follows the wallet's chain change without a page reload", async () => {
    const reload = vi.fn();
    const location = window.location;
    vi.spyOn(window, "location", "get").mockReturnValue(
      new Proxy(location, { get: (target, property) => (property === "reload" ? reload : Reflect.get(target, property)) as unknown }),
    );
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const { result } = renderHook(() => useWallet(), { wrapper: walletWrapper(wallet) });
    expect(result.current).toEqual(expect.objectContaining({ status: "connected", chainId: 1 }));
    await act(async () => {
      await wallet.changeChain(100);
    });
    await waitFor(() => {
      expect(result.current).toEqual(expect.objectContaining({ status: "connected", chainId: 100, isConfiguredChain: true }));
    });
    await act(async () => {
      await wallet.changeChain(UNCONFIGURED_CHAIN_ID);
    });
    await waitFor(() => {
      expect(result.current).toEqual(expect.objectContaining({ chainId: UNCONFIGURED_CHAIN_ID, isConfiguredChain: false }));
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it("disconnecting returns to read-only", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderHook(() => useWallet(), { wrapper: walletWrapper(wallet) });
    await act(async () => {
      await wallet.disconnect();
    });
    expect(result.current).toEqual({ status: "disconnected", mode: "appkit" });
  });
});
