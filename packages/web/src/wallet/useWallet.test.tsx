import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_WALLET_ADDRESS, UNCONFIGURED_CHAIN_ID, createConnectedTestWallet, walletWrapper } from "../test/wallet";
import type { WalletState } from "./types";
import { toWalletState, useWallet, type WagmiAccount } from "./useWallet";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A connector as wagmi persists it: no method, so wagmi has not restored it yet. */
const STORED_CONNECTOR = { id: "injected", name: "Injected", type: "injected", uid: "bcfb5cd94f3" };

/** A connector wagmi has restored, which it can ask for the wallet's chain. */
const RESTORED_CONNECTOR = { ...STORED_CONNECTOR, getChainId: () => Promise.resolve(1) };

const ACCOUNT = "0x00000000000000000000000000000000000A11cE";

describe("toWalletState", () => {
  it.each<[string, WagmiAccount, WalletState]>([
    [
      "a connection wagmi has only read from storage is still connecting, so routing waits for the reconnect to settle",
      { status: "reconnecting", address: ACCOUNT, chainId: 1, connector: STORED_CONNECTOR },
      { status: "connecting" },
    ],
    [
      "a connection wagmi has restored is connected, with its address lowercased, while wagmi still checks the other wallets",
      { status: "reconnecting", address: ACCOUNT, chainId: 1, connector: RESTORED_CONNECTOR },
      { status: "connected", address: TEST_WALLET_ADDRESS, chainId: 1 },
    ],
    [
      "a wallet wagmi's mount-time check restores is connected, though nothing was stored",
      { status: "connecting", address: ACCOUNT, chainId: 1, connector: RESTORED_CONNECTOR },
      { status: "connected", address: TEST_WALLET_ADDRESS, chainId: 1 },
    ],
    ["wagmi reconnecting with no connection yet is connecting", { status: "reconnecting", address: undefined, chainId: undefined, connector: undefined }, { status: "connecting" }],
    [
      "wagmi's connecting without a remembered connection reads as disconnected, so a visitor who never connected is not kept waiting",
      { status: "connecting", address: undefined, chainId: undefined, connector: undefined },
      { status: "disconnected" },
    ],
    [
      "a wallet on a chain outside the configured ones is still connected, on that chain",
      { status: "connected", address: ACCOUNT, chainId: UNCONFIGURED_CHAIN_ID, connector: RESTORED_CONNECTOR },
      { status: "connected", address: TEST_WALLET_ADDRESS, chainId: UNCONFIGURED_CHAIN_ID },
    ],
  ])("%s", (_name, account, expected) => {
    expect(toWalletState(account)).toEqual(expected);
  });
});

describe("useWallet", () => {
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
