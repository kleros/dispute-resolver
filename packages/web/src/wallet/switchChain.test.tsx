import { act, renderHook } from "@testing-library/react";
import { connect } from "@wagmi/core";
import { describe, expect, it } from "vitest";
import { createFakeInjectedWallet, createTestWallet, walletWrapper, type FakeInjectedWalletOptions } from "../test/wallet";
import { configuredChains } from "./chains";
import { switchWalletChain, useNetworkSwitch } from "./switchChain";

/** A browser wallet that knows only mainnet, connected through wagmi's injected connector over the app's chains. */
async function connectedWalletWithoutGnosis(addChain: FakeInjectedWalletOptions["addChain"]) {
  const wallet = createFakeInjectedWallet({ chains: configuredChains(), knownChains: [1], addChain });
  const [connector] = wallet.config.connectors;
  if (connector === undefined) throw new Error("The injected connector was not created.");
  await connect(wallet.config, { connector });
  return wallet;
}

const GNOSIS_PUBLIC_RPC = configuredChains().find((chain) => chain.id === 100)?.rpcUrls.default.http[0];

describe("switchWalletChain", () => {
  it("P-03: switching without a connected wallet is a visible failure, not a silent one", async () => {
    const wallet = createTestWallet();
    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: false, reason: "no-wallet", message: "Connect a wallet to switch to Gnosis Network." });
  });

  it("P-03: a switch declined in the wallet is reported", async () => {
    const wallet = createTestWallet({ switchChainError: true });
    await wallet.connect();
    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: false, reason: "rejected", message: "The switch to Gnosis Network was declined in the wallet." });
  });

  it("P-03: a failed switch is reported with the wallet's reason", async () => {
    const wallet = createTestWallet({ switchChainError: new Error("Unrecognized chain ID") });
    await wallet.connect();
    const result = await switchWalletChain(wallet.config, 100);
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "failed" }));
    expect(result.ok ? "" : result.message).toMatch(/^Could not switch to Gnosis Network: /);
  });

  it("P-03: a wallet that lacks the chain is asked to add it, with the chain's public RPC, and then is on it", async () => {
    const wallet = await connectedWalletWithoutGnosis("approve");

    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: true });

    expect(wallet.addChainRequests).toEqual([{ chainId: "0x64", chainName: "Gnosis Network", rpcUrls: [GNOSIS_PUBLIC_RPC] }]);
    expect(wallet.chainId()).toBe(100);
    expect(wallet.config.state.chainId).toBe(100);
  });

  it("P-03: declining to add the chain is reported as a declined switch", async () => {
    const wallet = await connectedWalletWithoutGnosis("reject");

    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: false, reason: "rejected", message: "The switch to Gnosis Network was declined in the wallet." });

    expect(wallet.addChainRequests).toHaveLength(1);
    expect(wallet.chainId()).toBe(1);
  });

  it("P-03: a successful switch moves the wallet", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: true });
    expect(wallet.config.state.chainId).toBe(100);
  });
});

describe("useNetworkSwitch", () => {
  it("P-03: keeps a failure for an inline message until reset", async () => {
    const wallet = createTestWallet();
    const { result } = renderHook(() => useNetworkSwitch(), { wrapper: walletWrapper(wallet) });
    let ok = true;
    await act(async () => {
      ok = await result.current.switchTo(100);
    });
    expect(ok).toBe(false);
    expect(result.current.state).toEqual({ status: "failed", chainId: 100, message: "Connect a wallet to switch to Gnosis Network." });
    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });
});
