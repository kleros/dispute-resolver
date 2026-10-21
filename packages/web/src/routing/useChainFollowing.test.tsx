import { act, screen, waitFor } from "@testing-library/react";
import type { Connector } from "@wagmi/core";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderAtPath } from "../test/routing";
import { UNCONFIGURED_CHAIN_ID, createTestWallet, walletWrapper, type TestWallet } from "../test/wallet";
import { usePageChain } from "./pageChain";

function PageProbe() {
  return <p>Page on {usePageChain().chainId}</p>;
}

function walletConnector(wallet: TestWallet): Connector {
  const [connector] = wallet.config.connectors;
  if (connector === undefined) throw new Error("The test wallet has no connector.");
  return connector;
}

/** Records every switch request the app makes, while letting the mock connector carry it out. */
function spyOnSwitches(wallet: TestWallet) {
  return vi.spyOn(walletConnector(wallet), "switchChain");
}

describe("useChainFollowing (D-55, ARCHITECTURE.md §3.6)", () => {
  it("D-55: a wallet chain change moves the app to that chain without a reload, keeping the path and search", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const view = renderAtPath(<PageProbe />, "/1/cases/5?ref=share", { wallet });
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    const frameBefore = view.container.querySelector("[data-frame-kind]");
    await act(async () => {
      await wallet.changeChain(100);
    });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/cases/5?ref=share");
    // The frame is the same element: the app navigated in place instead of loading again.
    expect(view.container.querySelector("[data-frame-kind]")).toBe(frameBefore);
  });

  it("D-55: a wallet change to an unconfigured chain shows the unsupported-network screen", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    await act(async () => {
      await wallet.changeChain(UNCONFIGURED_CHAIN_ID);
    });
    expect(await screen.findByRole("heading", { name: `Unsupported Network ${String(UNCONFIGURED_CHAIN_ID)}` })).toBeInTheDocument();
    expect(view.currentPath()).toBe(`/${String(UNCONFIGURED_CHAIN_ID)}/ongoing`);
  });

  it("P-13: a wallet change to chain 690 (Redstone, dropped) shows the unsupported-network screen", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    await act(async () => {
      await wallet.changeChain(690);
    });
    expect(await screen.findByRole("heading", { name: "Unsupported Network 690" })).toBeInTheDocument();
    expect(view.currentPath()).toBe("/690/ongoing");
  });

  it("D-55: from the unsupported-network screen, a wallet change to a configured chain shows that chain's page", async () => {
    const wallet = createTestWallet({ chainId: 137 });
    await wallet.connect();
    const view = renderAtPath(<PageProbe />, "/10/ongoing", { wallet });
    await act(async () => {
      await wallet.changeChain(100);
    });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
  });

  it("a wallet change on a page whose first segment names no chain replaces that segment instead of keeping it", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const view = renderAtPath(<PageProbe />, "/abc/cases/5?ref=share#e", { wallet });
    await act(async () => {
      await wallet.changeChain(100);
    });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/cases/5?ref=share#e");
  });

  it("D-55: at load, a wallet on another chain than the URL's is asked once to switch, and the URL stays", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/1/cases/5", { wallet });
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(1);
    });
    expect(switches).toHaveBeenCalledTimes(1);
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 1 }));
    expect(view.currentPath()).toBe("/1/cases/5");
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
  });

  it("D-55: under StrictMode's double effects the load-time switch is still requested once", async () => {
    const wallet = createTestWallet({ chainId: 100, switchChainError: true });
    await wallet.connect();
    const switches = spyOnSwitches(wallet);
    const Providers = walletWrapper(wallet);
    function StrictProviders({ children }: { readonly children?: ReactNode }) {
      return (
        <StrictMode>
          <Providers>{children}</Providers>
        </StrictMode>
      );
    }
    renderAtPath(<PageProbe />, "/1/ongoing", { wrapper: StrictProviders });
    await waitFor(() => {
      expect(switches).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(switches).toHaveBeenCalledTimes(1);
  });

  it("D-48: a declined switch at load leaves the page on the URL's chain and is not asked again", async () => {
    const wallet = createTestWallet({ chainId: 100, switchChainError: true });
    await wallet.connect();
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    await waitFor(() => {
      expect(switches).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.currentPath()).toBe("/1/ongoing");
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    expect(switches).toHaveBeenCalledTimes(1);
  });

  it("D-48, D-55: a reconnect of the same wallet is not a new connection, so a declined switch is not asked again", async () => {
    const wallet = createTestWallet({ chainId: 100, switchChainError: true });
    await wallet.connect();
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    await waitFor(() => {
      expect(switches).toHaveBeenCalledTimes(1);
    });
    // With an injected wallet the built app reconnects twice at load (e2e/app/wallet-chain.spec.ts): the connection
    // passes through `reconnecting` and settles again on the same chain.
    act(() => {
      wallet.config.setState((state) => ({ ...state, status: "reconnecting" }));
    });
    act(() => {
      wallet.config.setState((state) => ({ ...state, status: "connected" }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(switches).toHaveBeenCalledTimes(1);
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("D-55: the user's first connect on another chain asks for the page chain once and never navigates", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    expect(switches).not.toHaveBeenCalled();
    await act(async () => {
      await wallet.connect();
    });
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(1);
    });
    expect(switches).toHaveBeenCalledTimes(1);
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("D-55: a wallet already on the page chain is not asked to switch", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    const switches = spyOnSwitches(wallet);
    renderAtPath(<PageProbe />, "/100/ongoing", { wallet });
    await act(async () => {
      await Promise.resolve();
    });
    expect(switches).not.toHaveBeenCalled();
  });

  it("D-55: on the unsupported-network screen nothing is requested at load", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/10/ongoing", { wallet });
    await act(async () => {
      await Promise.resolve();
    });
    expect(switches).not.toHaveBeenCalled();
    expect(view.currentPath()).toBe("/10/ongoing");
  });

  it.each([
    ["0", 0],
    ["NaN", Number.NaN],
  ])("R-01 (D-55): a wallet chain ID of %s is ignored: no crash, no navigation, the page stays", async (_label, chainId) => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const switches = spyOnSwitches(wallet);
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    act(() => {
      walletConnector(wallet).emitter.emit("change", { chainId });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Page on 1")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/1/ongoing");
    expect(switches).not.toHaveBeenCalled();
    await act(async () => {
      await wallet.changeChain(100);
    });
    expect(await screen.findByText("Page on 100")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
  });

  it("D-55: disconnecting does not navigate, and reconnecting is a new connection, not a change", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    const view = renderAtPath(<PageProbe />, "/1/ongoing", { wallet });
    await act(async () => {
      await wallet.disconnect();
    });
    expect(view.currentPath()).toBe("/1/ongoing");
    await act(async () => {
      await wallet.connect();
    });
    expect(view.currentPath()).toBe("/1/ongoing");
  });
});
