import { getChain, type ChainConfig } from "@dispute-resolver/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TestDataProvider } from "../test/data";
import { createTestWallet, walletWrapper } from "../test/wallet";
import { WalletControl } from "./WalletControl";
import { WalletSetupProvider } from "./WalletProvider";

function chain(id: number): ChainConfig {
  const config = getChain(id);
  if (config === undefined) throw new Error(`Chain ${String(id)} is not configured.`);
  return config;
}

/** A closed panel first animates out, inert; jsdom runs no animation, so the test ends it before checking the unmount. */
function expectAccountPanelClosed() {
  const panel = screen.queryByRole("dialog", { name: "Account" });
  if (panel !== null) {
    expect(panel).toHaveAttribute("inert");
    fireEvent.animationEnd(panel);
  }
  expect(screen.queryByRole("dialog")).toBeNull();
}

describe("WalletControl", () => {
  it("Connect opens AppKit's Connect view on the page chain", async () => {
    const wallet = createTestWallet();
    render(<WalletControl chain={chain(100)} />, { wrapper: walletWrapper(wallet) });
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(100);
  });

  it("without a project ID Connect is disabled and nothing on the control mentions configuration", () => {
    const wallet = createTestWallet({ mode: "unconfigured" });
    const { container } = render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAccessibleDescription();
    expect(container).not.toHaveTextContent(/configured|deployment|unavailable/i);
  });

  it("once AppKit reports an embedded-wallet connector Connect is disabled the same way and never opens the modal", async () => {
    const wallet = createTestWallet({ embeddedWallet: true });
    const { container } = render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    });
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button).not.toHaveAccessibleDescription();
    expect(container).not.toHaveTextContent(/configured|deployment|unavailable/i);
    await userEvent.click(button);
    expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
  });

  it("a control mounted after the check renders the misconfiguration at once", async () => {
    const wallet = createTestWallet({ embeddedWallet: true });
    const first = render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    });
    first.unmount();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("a connected wallet shows its short address and the app's account menu, linking a Gnosis wallet to gnosisscan.io", async () => {
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

  it("the account trigger is announced as the button that opens the account panel it controls", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    render(<WalletControl chain={chain(100)} />, { wrapper: walletWrapper(wallet) });
    const trigger = screen.getByRole("button", { name: "Account 0x0000…11cE" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Account" });
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveTextContent("0x0000…11cE");
  });

  it("Disconnect returns the app to read-only", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    await userEvent.click(screen.getByRole("button", { name: /^Account / }));
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    });
  });

  it("Escape closes the account menu and returns focus to its button", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    const trigger = screen.getByRole("button", { name: /^Account / });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expectAccountPanelClosed();
    expect(trigger).toHaveFocus();
  });

  it("the account panel grows from its top-right corner and shrinks away, ignoring presses, before it unmounts", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    const trigger = screen.getByRole("button", { name: /^Account / });
    await userEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Account" });
    expect(panel).toHaveAttribute("data-origin", "top-right");
    expect(panel).toHaveClass("origin-top-right", "animate-scale-in");
    expect(panel).not.toHaveAttribute("inert");
    await userEvent.click(trigger);
    expect(panel).toHaveClass("animate-scale-out", "opacity-0", "pointer-events-none");
    expect(panel).not.toHaveClass("animate-scale-in");
    expect(panel).toHaveAttribute("inert");
    expectAccountPanelClosed();
  });

  it("the account chevron flips over the open clock and back over the close clock, and holds still under reduced motion", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    const trigger = screen.getByRole("button", { name: /^Account / });
    const chevron = () => {
      const icon = trigger.querySelector("svg.order-last");
      if (icon === null) throw new Error("The trigger has no chevron.");
      return icon;
    };
    expect(chevron()).toHaveClass("transition-transform", "duration-150", "motion-reduce:transition-none");
    expect(chevron()).not.toHaveClass("-scale-y-100");
    await userEvent.click(trigger);
    expect(chevron()).toHaveClass("-scale-y-100", "duration-250");
  });

  it("a press outside closes the account menu", async () => {
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
    expectAccountPanelClosed();
  });

  it("names the control while the wallet connects, though the library hides the button's text while loading", () => {
    const wallet = createTestWallet();
    render(
      <TestDataProvider>
        <WalletSetupProvider setup={wallet.setup} pending pendingReconnect>
          <WalletControl chain={chain(1)} />
        </WalletSetupProvider>
      </TestDataProvider>,
    );
    const button = screen.getByRole("button", { name: "Connecting" });
    expect(button).toHaveAttribute("aria-label", "Connecting");
    expect(button).toBeDisabled();
  });

  it("the Connect button takes its name from its visible text", () => {
    const wallet = createTestWallet();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    expect(screen.getByRole("button", { name: "Connect" })).not.toHaveAttribute("aria-label");
  });

  it("the account panel draws the surface's focus ring, not the bar's", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    await userEvent.click(screen.getByRole("button", { name: /^Account / }));
    expect(screen.getByRole("dialog", { name: "Account" })).toHaveClass("[--dr-focus:var(--klerosUIComponentsPrimaryBlue)]");
  });

  it("the control follows a wallet that connects after render", async () => {
    const wallet = createTestWallet();
    render(<WalletControl chain={chain(1)} />, { wrapper: walletWrapper(wallet) });
    await act(async () => {
      await wallet.connect();
    });
    expect(screen.getByRole("button", { name: /^Account / })).toBeInTheDocument();
  });
});
