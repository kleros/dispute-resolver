import { renderHook, waitFor } from "@testing-library/react";
import { getAccount } from "@wagmi/core";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { TestDataProvider } from "../test/data";
import { TEST_TX_HASH, TEST_WALLET_ACCOUNT, TEST_WALLET_ADDRESS, createReturningTestWallet, testReceipt, testWriteBuild, type ReturningTestWallet } from "../test/wallet";
import { performWrite } from "./performWrite";
import { switchWalletChain } from "./switchChain";
import type { WriteStatus } from "./types";
import { useWallet } from "./useWallet";
import { WalletSetupProvider } from "./WalletProvider";

let open: ReturningTestWallet[] = [];

afterEach(async () => {
  for (const wallet of open) {
    await wallet.authorizeRemembered();
    await wallet.endProbe();
  }
  open = [];
});

async function returningWallet(stored = true): Promise<ReturningTestWallet> {
  const wallet = await createReturningTestWallet({ stored });
  open.push(wallet);
  return wallet;
}

function reconnectingWrapper(wallet: ReturningTestWallet) {
  return function ReconnectingWrapper({ children }: { readonly children?: ReactNode }) {
    return (
      <TestDataProvider>
        <WalletSetupProvider setup={wallet.setup}>{children}</WalletSetupProvider>
      </TestDataProvider>
    );
  };
}

/** The returning wallet, rendered, once wagmi has restored its connection while it still waits on the other wallet. */
async function restoredWhileProbing(wallet: ReturningTestWallet) {
  const view = renderHook(() => useWallet(), { wrapper: reconnectingWrapper(wallet) });
  await wallet.authorizeRemembered();
  await waitFor(() => {
    expect(getAccount(wallet.config).connector?.uid).toBe(wallet.remembered.uid);
  });
  expect(wallet.config.state.status).toBe("reconnecting");
  return view;
}

describe("a returning wallet while wagmi reconnects", () => {
  it("reads as connected as soon as its connection is restored, while wagmi still checks the other installed wallets", async () => {
    const wallet = await returningWallet();
    const { result } = renderHook(() => useWallet(), { wrapper: reconnectingWrapper(wallet) });
    expect(result.current).toEqual({ status: "connecting" });
    await wallet.authorizeRemembered();
    await waitFor(() => {
      expect(result.current).toEqual({ status: "connected", address: TEST_WALLET_ADDRESS, chainId: 100 });
    });
    expect(wallet.config.state.status).toBe("reconnecting");
    await wallet.endProbe();
    await waitFor(() => {
      expect(wallet.config.state.status).toBe("connected");
    });
    expect(result.current).toEqual({ status: "connected", address: TEST_WALLET_ADDRESS, chainId: 100 });
  });

  it("stays connecting while only the connection stored by the last visit is known, though wagmi already reports its account", async () => {
    const wallet = await returningWallet();
    const { result } = renderHook(() => useWallet(), { wrapper: reconnectingWrapper(wallet) });
    expect(getAccount(wallet.config)).toEqual(expect.objectContaining({ status: "reconnecting", address: TEST_WALLET_ACCOUNT, chainId: 1 }));
    expect(result.current).toEqual({ status: "connecting" });
  });

  it("without a stored connection reads as disconnected while wagmi checks the installed wallets", async () => {
    const wallet = await returningWallet(false);
    const { result } = renderHook(() => useWallet(), { wrapper: reconnectingWrapper(wallet) });
    expect(wallet.config.state.status).toBe("connecting");
    expect(result.current).toEqual({ status: "disconnected" });
  });

  it("a write made as soon as the wallet reads connected is signed by the restored wallet", async () => {
    const wallet = await returningWallet();
    await restoredWhileProbing(wallet);
    const reports: WriteStatus[] = [];
    const environment = { config: wallet.config, waitForReceipt: () => Promise.resolve(testReceipt()), simulate: () => Promise.resolve({ status: "ok" } as const) };
    const outcome = await performWrite(environment, testWriteBuild(100), { pageChainId: 100 }, (status) => reports.push(status));
    expect(outcome).toEqual(expect.objectContaining({ phase: "mined", hash: TEST_TX_HASH }));
    expect(reports.map((status) => status.phase)).toEqual(["checking", "pending", "submitted", "mined"]);
    expect(wallet.sent).toHaveLength(1);
    expect(wallet.config.state.status).toBe("reconnecting");
  });

  it("a network switch asked as soon as the wallet reads connected reaches the restored wallet", async () => {
    const wallet = await returningWallet();
    const { result } = await restoredWhileProbing(wallet);
    await expect(switchWalletChain(wallet.config, 1)).resolves.toEqual({ ok: true });
    await expect(wallet.remembered.getChainId()).resolves.toBe(1);
    await waitFor(() => {
      expect(result.current).toEqual({ status: "connected", address: TEST_WALLET_ADDRESS, chainId: 1 });
    });
  });
});
