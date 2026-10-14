import { getChain, type ChainConfig } from "@dispute-resolver/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createTestWallet, walletWrapper } from "../test/wallet";
import { ChainIndicator } from "./ChainIndicator";

function chain(id: number): ChainConfig {
  const config = getChain(id);
  if (config === undefined) throw new Error(`Chain ${String(id)} is not configured.`);
  return config;
}

describe("ChainIndicator", () => {
  it("§11.2: shows the resolved chain's name to a read-only visitor, with nothing to press", () => {
    const wallet = createTestWallet();
    render(<ChainIndicator chain={chain(100)} isPageChain />, { wrapper: walletWrapper(wallet) });
    expect(screen.getByText("Gnosis Network")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("D-48: offers the switch to the page chain when the wallet is on another chain", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    render(<ChainIndicator chain={chain(100)} isPageChain />, { wrapper: walletWrapper(wallet) });
    await userEvent.click(screen.getByRole("button", { name: "Switch to Gnosis Network" }));
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(100);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Switch to Gnosis Network" })).toBeNull();
    });
  });

  it("P-03: a switch declined in the wallet is shown inline", async () => {
    const wallet = createTestWallet({ chainId: 1, switchChainError: true });
    await wallet.connect();
    render(<ChainIndicator chain={chain(100)} isPageChain />, { wrapper: walletWrapper(wallet) });
    await userEvent.click(screen.getByRole("button", { name: "Switch to Gnosis Network" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The switch to Gnosis Network was declined in the wallet.");
  });

  it("D-45: on a fallback chain (an error screen) no switch is offered", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    render(<ChainIndicator chain={chain(1)} isPageChain={false} />, { wrapper: walletWrapper(wallet) });
    expect(screen.queryByRole("button", { name: /^Switch to/ })).toBeNull();
  });

  it("D-55: in the AppKit mode a connected wallet's chain name opens the Networks view", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    render(<ChainIndicator chain={chain(100)} isPageChain />, { wrapper: walletWrapper(wallet) });
    await userEvent.click(screen.getByRole("button", { name: "Network: Gnosis Network. Change the wallet's network" }));
    expect(wallet.modal?.openNetworks).toHaveBeenCalledTimes(1);
  });

  it("K-02: in the unconfigured mode the name is plain text", () => {
    const wallet = createTestWallet({ mode: "unconfigured" });
    render(<ChainIndicator chain={chain(1)} isPageChain />, { wrapper: walletWrapper(wallet) });
    expect(screen.getByText("Ethereum Mainnet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
