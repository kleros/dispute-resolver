import { getChain, type ChainConfig } from "@dispute-resolver/core";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createTestWallet, walletWrapper } from "../test/wallet";
import { WalletControl } from "./WalletControl";

function chain(id: number): ChainConfig {
  const config = getChain(id);
  if (config === undefined) throw new Error(`Chain ${String(id)} is not configured.`);
  return config;
}

describe("WalletControl", () => {
  it("§2.3: Connect opens AppKit's Connect view on the page chain", async () => {
    const wallet = createTestWallet();
    render(<WalletControl chain={chain(100)} />, { wrapper: walletWrapper(wallet) });
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(100);
  });

  it("K-02: without a project ID Connect is disabled and explains why", () => {
    const wallet = createTestWallet({ mode: "unconfigured" });
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Wallet connection is not configured on this deployment.");
    expect(screen.getByText("Not configured")).toHaveAttribute("aria-hidden", "true");
  });

  it("K-03: once AppKit reports an embedded-wallet connector, Connect is disabled, explains why and never opens the modal", async () => {
    const wallet = createTestWallet({ embeddedWallet: true });
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    });
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button).toHaveAccessibleDescription("Wallet connection is misconfigured on this deployment.");
    expect(screen.getByText("Misconfigured")).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(button);
    expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
  });

  it("K-03: a control mounted after the check renders the misconfiguration at once", async () => {
    const wallet = createTestWallet({ embeddedWallet: true });
    const first = render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    });
    first.unmount();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("§11.2: a connected wallet shows its short address and the app's account menu", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    render(<WalletControl chain={chain(100)} />, { wrapper: walletWrapper(wallet) });
    const trigger = screen.getByRole("button", { name: "Account 0x0000…11cE" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("dialog", { name: "Account" });
    expect(menu).toHaveTextContent("Wallet network: Gnosis Network");
    expect(screen.getByRole("button", { name: "Copy address" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view on Gnosis Network explorer/ })).toHaveAttribute(
      "href",
      "https://gnosisscan.io/address/0x00000000000000000000000000000000000a11ce",
    );
    expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
  });

  it("D-06: Disconnect returns the app to read-only", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    await userEvent.click(screen.getByRole("button", { name: /^Account / }));
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    });
  });

  it("§11.2: Escape closes the account menu and returns focus to its button", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    const trigger = screen.getByRole("button", { name: /^Account / });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("§11.2: a press outside closes the account menu", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    render(
      <>
        <WalletControl chain={chain(1)} />
        <p>Outside</p>
      </>,
      { wrapper: walletWrapper(wallet) },
    );
    await userEvent.click(screen.getByRole("button", { name: /^Account / }));
    await userEvent.click(screen.getByText("Outside"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("D-55: the control follows a wallet that connects after render", async () => {
    const wallet = createTestWallet();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    await act(async () => {
      await wallet.connect();
    });
    expect(screen.getByRole("button", { name: /^Account / })).toBeInTheDocument();
  });
});
