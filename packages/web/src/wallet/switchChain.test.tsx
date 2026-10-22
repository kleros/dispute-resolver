import { act, renderHook } from "@testing-library/react";
import { connect, type Connector } from "@wagmi/core";
import { UserRejectedRequestError } from "viem";
import { describe, expect, it, vi } from "vitest";
import { createFakeInjectedWallet, createTestWallet, holdChainSwitches, walletWrapper, type FakeInjectedWalletOptions, type TestWallet } from "../test/wallet";
import { configuredChains } from "./chains";
import { switchWalletChain, useNetworkSwitch, type SwitchResult } from "./switchChain";

/** A browser wallet that knows only mainnet, connected through wagmi's injected connector over the app's chains. */
async function connectedWalletWithoutGnosis(addChain: FakeInjectedWalletOptions["addChain"]) {
  const wallet = createFakeInjectedWallet({ chains: configuredChains(), knownChains: [1], addChain });
  const [connector] = wallet.config.connectors;
  if (connector === undefined) throw new Error("The injected connector was not created.");
  await connect(wallet.config, { connector });
  return wallet;
}

const GNOSIS_PUBLIC_RPC = configuredChains().find((chain) => chain.id === 100)?.rpcUrls.default.http[0];

const PENDING: SwitchResult = { ok: false, reason: "pending", message: "A network switch is already waiting in your wallet." };

function walletConnector(wallet: TestWallet): Connector {
  const [connector] = wallet.config.connectors;
  if (connector === undefined) throw new Error("The test wallet has no connector.");
  return connector;
}

/** The wallet keeps the next switch request open until the test declines it, as a user who reads the prompt first. */
function declineLater(wallet: TestWallet): () => void {
  let decline: (() => void) | undefined;
  vi.spyOn(walletConnector(wallet), "switchChain").mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        decline = () => {
          reject(new UserRejectedRequestError(new Error("Declined in the wallet.")));
        };
      }),
  );
  return () => {
    if (decline === undefined) throw new Error("No switch request reached the wallet.");
    decline();
  };
}

describe("switchWalletChain", () => {
  it("switching without a connected wallet is a visible failure, not a silent one", async () => {
    const wallet = createTestWallet();
    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: false, reason: "no-wallet", message: "Connect a wallet to switch to Gnosis Network." });
  });

  it("a switch declined in the wallet is reported", async () => {
    const wallet = createTestWallet({ switchChainError: true });
    await wallet.connect();
    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: false, reason: "rejected", message: "The switch to Gnosis Network was declined in the wallet." });
  });

  it("a failed switch is reported with the wallet's reason", async () => {
    const wallet = createTestWallet({ switchChainError: new Error("Unrecognized chain ID") });
    await wallet.connect();
    const result = await switchWalletChain(wallet.config, 100);
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "failed" }));
    expect(result.ok ? "" : result.message).toMatch(/^Could not switch to Gnosis Network: /);
  });

  it("a wallet that lacks the chain is asked to add it, with the chain's public RPC, and then is on it", async () => {
    const wallet = await connectedWalletWithoutGnosis("approve");

    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: true });

    expect(wallet.addChainRequests).toEqual([{ chainId: "0x64", chainName: "Gnosis Network", rpcUrls: [GNOSIS_PUBLIC_RPC] }]);
    expect(wallet.chainId()).toBe(100);
    expect(wallet.config.state.chainId).toBe(100);
  });

  it("declining to add the chain is reported as a declined switch", async () => {
    const wallet = await connectedWalletWithoutGnosis("reject");

    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: false, reason: "rejected", message: "The switch to Gnosis Network was declined in the wallet." });

    expect(wallet.addChainRequests).toHaveLength(1);
    expect(wallet.chainId()).toBe(1);
  });

  it("a successful switch moves the wallet", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: true });
    expect(wallet.config.state.chainId).toBe(100);
  });

  it("a second switch request while one waits in the wallet sends nothing and says one is already waiting", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const switches = vi.spyOn(walletConnector(wallet), "switchChain");
    holdChainSwitches(wallet);
    void switchWalletChain(wallet.config, 100);
    expect(await switchWalletChain(wallet.config, 11155111)).toEqual(PENDING);
    expect(switches).toHaveBeenCalledTimes(1);
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 100 }));
  });

  it("once a request settles the next one reaches the wallet", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const decline = declineLater(wallet);
    const first = switchWalletChain(wallet.config, 100);
    decline();
    expect(await first).toEqual({ ok: false, reason: "rejected", message: "The switch to Gnosis Network was declined in the wallet." });
    expect(await switchWalletChain(wallet.config, 100)).toEqual({ ok: true });
    expect(wallet.config.state.chainId).toBe(100);
  });
});

describe("useNetworkSwitch", () => {
  it("keeps a failure for an inline message until reset", async () => {
    const wallet = createTestWallet();
    const { result } = renderHook(() => useNetworkSwitch(), { wrapper: walletWrapper(wallet) });
    let outcome: SwitchResult | undefined;
    await act(async () => {
      outcome = await result.current.switchTo(100);
    });
    expect(outcome).toEqual({ ok: false, reason: "no-wallet", message: "Connect a wallet to switch to Gnosis Network." });
    expect(result.current.state).toEqual({ status: "failed", chainId: 100, message: "Connect a wallet to switch to Gnosis Network." });
    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("every switch control shows a request another one started as switching until it settles", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const decline = declineLater(wallet);
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
    const wallet = createTestWallet();
    await wallet.connect();
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
    const wallet = createTestWallet({ switchChainError: new Error("Unrecognized chain ID") });
    await wallet.connect();
    const { result } = renderHook(() => ({ header: useNetworkSwitch(), notice: useNetworkSwitch() }), { wrapper: walletWrapper(wallet) });
    await act(async () => {
      await result.current.notice.switchTo(100);
    });
    const failure = result.current.notice.state;
    expect(failure).toEqual(expect.objectContaining({ status: "failed", chainId: 100 }));
    const decline = declineLater(wallet);
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
