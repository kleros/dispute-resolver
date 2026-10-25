import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_WALLET_ADDRESS, UNCONFIGURED_CHAIN_ID, createConnectedTestWallet, createTestWallet, walletWrapper } from "../test/wallet";
import { toWalletState, useWallet } from "./useWallet";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toWalletState", () => {
  it("a reconnecting wallet is still connecting, so routing waits for the reconnect to settle", () => {
    expect(toWalletState("reconnecting", "0x00000000000000000000000000000000000A11cE", 1)).toEqual({ status: "connecting" });
  });

  it("a connected address is lowercased", () => {
    expect(toWalletState("connected", "0x00000000000000000000000000000000000A11cE", 100)).toEqual({
      status: "connected",
      address: TEST_WALLET_ADDRESS,
      chainId: 100,
    });
  });

  it("a wallet on a chain outside the configured ones is still connected, on that chain", () => {
    expect(toWalletState("connected", "0x00000000000000000000000000000000000A11cE", UNCONFIGURED_CHAIN_ID)).toEqual(
      expect.objectContaining({ status: "connected", chainId: UNCONFIGURED_CHAIN_ID }),
    );
  });
});

describe("useWallet", () => {
  it("while AppKit loads a returning wallet is connecting, so routing waits as it does for wagmi's reconnect", () => {
    const { result } = renderHook(() => useWallet(), { wrapper: walletWrapper(createTestWallet({ pendingReconnect: true })) });
    expect(result.current).toEqual({ status: "connecting" });
  });

  it("the app loads disconnected and nothing is requested from a wallet", () => {
    const wallet = createTestWallet();
    const { result } = renderHook(() => useWallet(), { wrapper: walletWrapper(wallet) });
    expect(result.current).toEqual({ status: "disconnected" });
    expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
  });

  it("follows the wallet's chain change without a page reload", async () => {
    const reload = vi.fn();
    const location = window.location;
    vi.spyOn(window, "location", "get").mockReturnValue(
      new Proxy(location, { get: (target, property) => (property === "reload" ? reload : Reflect.get(target, property)) as unknown }),
    );
    const wallet = await createConnectedTestWallet({ chainId: 1 });
    const { result } = renderHook(() => useWallet(), { wrapper: walletWrapper(wallet) });
    expect(result.current).toEqual(expect.objectContaining({ status: "connected", chainId: 1 }));
    await act(async () => {
      await wallet.changeChain(100);
    });
    await waitFor(() => {
      expect(result.current).toEqual(expect.objectContaining({ status: "connected", chainId: 100 }));
    });
    await act(async () => {
      await wallet.changeChain(UNCONFIGURED_CHAIN_ID);
    });
    await waitFor(() => {
      expect(result.current).toEqual(expect.objectContaining({ status: "connected", chainId: UNCONFIGURED_CHAIN_ID }));
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it("disconnecting returns to read-only", async () => {
    const wallet = await createConnectedTestWallet();
    const { result } = renderHook(() => useWallet(), { wrapper: walletWrapper(wallet) });
    await act(async () => {
      await wallet.disconnect();
    });
    expect(result.current).toEqual({ status: "disconnected" });
  });
});
