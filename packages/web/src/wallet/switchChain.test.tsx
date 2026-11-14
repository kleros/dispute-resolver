import { act, renderHook } from "@testing-library/react";
import { connect } from "@wagmi/core";
import { describe, expect, it, vi } from "vitest";
import {
  createConnectedTestWallet,
  createFakeInjectedWallet,
  createTestWallet,
  declineNextSwitch,
  holdChainSwitches,
  walletConnector,
  walletWrapper,
  type FakeInjectedWalletOptions,
} from "../test/wallet";
import { configuredChains } from "./chains";
import { switchWalletChain, useNetworkSwitch, type SwitchResult } from "./switchChain";

/** A browser wallet that knows only mainnet, connected through wagmi's injected connector over the app's chains. */
async function connectedWalletWithoutGnosis(addChain: FakeInjectedWalletOptions["addChain"]) {
  const wallet = createFakeInjectedWallet({ chains: configuredChains(), knownChains: [1], addChain });
  await connect(wallet.config, { connector: walletConnector(wallet) });
  return wallet;
}

const GNOSIS_WALLET_RPC = configuredChains().find((chain) => chain.id === 100)?.rpcUrls.default.http[0];

const PENDING: SwitchResult = { ok: false, reason: "pending", message: "A network switch is already waiting in your wallet." };

describe("switchWalletChain", () => {
  it("switching without a connected wallet is a visible failure, not a silent one", async () => {
    const wallet = createTestWallet();
    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: false, reason: "no-wallet", message: "Connect a wallet to switch to Gnosis Network." });
  });

  it("a switch declined in the wallet is reported", async () => {
    const wallet = await createConnectedTestWallet({ switchChainError: true });
    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: false, reason: "rejected", message: "The switch to Gnosis Network was declined in the wallet." });
  });

  it("a failed switch is reported with the wallet's reason", async () => {
    const wallet = await createConnectedTestWallet({ switchChainError: new Error("Unrecognized chain ID") });
    const result = await switchWalletChain(wallet.config, 100);
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "failed" }));
    expect(result.ok ? "" : result.message).toMatch(/^Could not switch to Gnosis Network: /);
  });

  it("a wallet that lacks the chain is asked to add it, with the chain's public RPC, and then is on it", async () => {
    const wallet = await connectedWalletWithoutGnosis("approve");

    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: true });

    expect(wallet.addChainRequests).toEqual([{ chainId: "0x64", chainName: "Gnosis Network", rpcUrls: [GNOSIS_WALLET_RPC] }]);
    expect(wallet.chainId()).toBe(100);
    expect(wallet.config.state.chainId).toBe(100);
  });

  it("declining to add the chain is reported as a declined switch", async () => {
    const wallet = await connectedWalletWithoutGnosis("reject");

    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: false, reason: "rejected", message: "The switch to Gnosis Network was declined in the wallet." });

    expect(wallet.addChainRequests).toHaveLength(1);
    expect(wallet.chainId()).toBe(1);
  });

  it("a second switch request while one waits in the wallet sends nothing and says one is already waiting", async () => {
    const wallet = await createConnectedTestWallet();
    const switches = vi.spyOn(walletConnector(wallet), "switchChain");
    holdChainSwitches(wallet);
    void switchWalletChain(wallet.config, 100);
    expect(await switchWalletChain(wallet.config, 11155111)).toEqual(PENDING);
    expect(switches).toHaveBeenCalledTimes(1);
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 100 }));
  });

  it("once a request settles the next one reaches the wallet", async () => {
    const wallet = await createConnectedTestWallet();
    const decline = declineNextSwitch(wallet);
    const first = switchWalletChain(wallet.config, 100);
    decline();
    expect(await first).toEqual({ ok: false, reason: "rejected", message: "The switch to Gnosis Network was declined in the wallet." });
    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: true });
    expect(wallet.config.state.chainId).toBe(100);
  });
});

describe("useNetworkSwitch", () => {
  it("keeps a failure in its state for an inline message", async () => {
    const wallet = createTestWallet();
    const { result } = renderHook(() => useNetworkSwitch(), { wrapper: walletWrapper(wallet) });
    let outcome: SwitchResult | undefined;
    await act(async () => {
      outcome = await result.current.switchTo(100);
    });
    expect(outcome).toEqual({ ok: false, reason: "no-wallet", message: "Connect a wallet to switch to Gnosis Network." });
    expect(result.current.state).toEqual({ status: "failed", chainId: 100, message: "Connect a wallet to switch to Gnosis Network." });
  });

  it("every switch control shows a request another one started as switching until it settles", async () => {
    const wallet = await createConnectedTestWallet();
    const decline = declineNextSwitch(wallet);
    const { result } = renderHook(() => ({ header: useNetworkSwitch(), notice: useNetworkSwitch() }), { wrapper: walletWrapper(wallet) });
    let started: Promise<SwitchResult> | undefined;
    act(() => {
      started = result.current.header.switchTo(100);
    });
    expect(result.current.header.state).toEqual({ status: "switching", chainId: 100 });
    expect(result.current.notice.state).toEqual({ status: "switching", chainId: 100 });
    await act(async () => {
      decline();
      await started;
    });
    expect(result.current.header.state).toEqual({ status: "failed", chainId: 100, message: "The switch to Gnosis Network was declined in the wallet." });
    expect(result.current.notice.state).toEqual({ status: "idle" });
  });

  it("while a request waits every switch control shows it, though the wallet never answers", async () => {
    const wallet = await createConnectedTestWallet();
    holdChainSwitches(wallet);
    const { result } = renderHook(() => ({ header: useNetworkSwitch(), notice: useNetworkSwitch() }), { wrapper: walletWrapper(wallet) });
    let second: SwitchResult | undefined;
    await act(async () => {
      void result.current.header.switchTo(100);
      second = await result.current.notice.switchTo(1);
    });
    expect(second).toEqual(PENDING);
    expect(result.current.header.state).toEqual({ status: "switching", chainId: 100 });
    expect(result.current.notice.state).toEqual({ status: "switching", chainId: 100 });
  });

  it("a request waiting elsewhere leaves this control's failure as it was", async () => {
    const wallet = await createConnectedTestWallet({ switchChainError: new Error("Unrecognized chain ID") });
    const { result } = renderHook(() => ({ header: useNetworkSwitch(), notice: useNetworkSwitch() }), { wrapper: walletWrapper(wallet) });
    await act(async () => {
      await result.current.notice.switchTo(100);
    });
    const failure = result.current.notice.state;
    expect(failure).toEqual(expect.objectContaining({ status: "failed", chainId: 100 }));
    const decline = declineNextSwitch(wallet);
    let elsewhere: Promise<SwitchResult> | undefined;
    let again: SwitchResult | undefined;
    await act(async () => {
      elsewhere = result.current.header.switchTo(1);
      again = await result.current.notice.switchTo(11155111);
    });
    expect(again).toEqual(PENDING);
    await act(async () => {
      decline();
      await elsewhere;
    });
    expect(result.current.notice.state).toEqual(failure);
  });
});
