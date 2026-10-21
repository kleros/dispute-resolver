import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/shell";
import { createTestWallet, type TestWallet } from "../test/wallet";

function Screen() {
  return <p>Screen content</p>;
}

function pill(chainName: string) {
  return within(screen.getByRole("banner")).getByRole("button", { name: `Network: ${chainName}. Change network` });
}

function menuItems() {
  return within(screen.getByRole("menu", { name: "Network" })).getAllByRole("menuitem");
}

function spySwitches(wallet: TestWallet) {
  const [connector] = wallet.config.connectors;
  if (connector === undefined) throw new Error("The test wallet has no connector.");
  return vi.spyOn(connector, "switchChain");
}

async function connected(chainId: number, switchChainError?: boolean) {
  const wallet = createTestWallet({ chainId, switchChainError });
  await wallet.connect();
  return wallet;
}

describe("ChainSwitcher", () => {
  it("offers exactly Ethereum Mainnet and Gnosis Network, marking the page chain", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    const trigger = pill("Gnosis Network");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = menuItems();
    expect(items.map((item) => item.textContent)).toEqual(["Ethereum Mainnet", "Gnosis Network"]);
    expect(items[1]).toHaveAttribute("aria-current", "page");
    expect(items[0]).not.toHaveAttribute("aria-current");
  });

  it("lists no testnet and marks nothing on a testnet page", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/11155111/ongoing", frame: "page" });
    await user.click(pill("Ethereum Testnet Sepolia"));
    const items = menuItems();
    expect(items.map((item) => item.textContent)).toEqual(["Ethereum Mainnet", "Gnosis Network"]);
    for (const item of items) expect(item).not.toHaveAttribute("aria-current");
  });

  it("without a wallet, choosing a chain moves the page to that chain keeping the path, search and hash and asks no wallet", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet();
    const switches = spySwitches(wallet);
    const view = renderWithProviders(<Screen />, { path: "/1/cases/55?tab=evidence#e", frame: "page", wallet });
    await user.click(pill("Ethereum Mainnet"));
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/cases/55?tab=evidence#e");
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
    expect(switches).not.toHaveBeenCalled();
    expect(pill("Gnosis Network")).toHaveFocus();
  });

  it("on the unsupported-network screen choosing a chain replaces the bad segment", async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<Screen />, { path: "/abc/ongoing", frame: "page" });
    await user.click(pill("Ethereum Mainnet"));
    for (const item of menuItems()) expect(item).not.toHaveAttribute("aria-current");
    await user.click(screen.getByRole("menuitem", { name: "Ethereum Mainnet" }));
    await waitFor(() => {
      expect(view.currentPath()).toBe("/1/ongoing");
    });
  });

  it("on the unsupported-network screen with the wallet on another chain, the page follows the wallet to the chosen chain's page", async () => {
    const user = userEvent.setup();
    const wallet = await connected(1);
    const switches = spySwitches(wallet);
    const view = renderWithProviders(<Screen />, { path: "/abc/ongoing", frame: "page", wallet });
    await user.click(pill("Ethereum Mainnet"));
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 100 }));
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(100);
    });
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing");
    });
  });

  it("on the unsupported-network screen the page follows the wallet keeping the rest of the path, the search and the hash", async () => {
    const user = userEvent.setup();
    const wallet = await connected(100);
    const switches = spySwitches(wallet);
    const view = renderWithProviders(<Screen />, { path: "/abc/cases/5?x=1#y", frame: "page", wallet });
    await user.click(pill("Gnosis Network"));
    await user.click(screen.getByRole("menuitem", { name: "Ethereum Mainnet" }));
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 1 }));
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(1);
    });
    await waitFor(() => {
      expect(view.currentPath()).toBe("/1/cases/5?x=1#y");
    });
  });

  it("with a wallet connected, choosing a chain asks the wallet and the page follows it", async () => {
    const user = userEvent.setup();
    const wallet = await connected(1);
    const switches = spySwitches(wallet);
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page", wallet });
    await user.click(pill("Ethereum Mainnet"));
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 100 }));
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(100);
    });
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing");
    });
  });

  it("a switch the wallet declines leaves the page where it is and says so under the pill", async () => {
    const user = userEvent.setup();
    const wallet = await connected(1, true);
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page", wallet });
    await user.click(pill("Ethereum Mainnet"));
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    expect(await within(screen.getByRole("banner")).findByRole("alert")).toHaveTextContent("The switch to Gnosis Network was declined in the wallet.");
    expect(view.currentPath()).toBe("/1/ongoing");
    expect(wallet.config.state.chainId).toBe(1);
  });

  it("with the wallet already on the chosen chain, choosing it moves the page without asking the wallet", async () => {
    const user = userEvent.setup();
    // The wallet declines the switch to the page chain asked for at load, so it stays on Gnosis.
    const wallet = await connected(100, true);
    const switches = spySwitches(wallet);
    const view = renderWithProviders(<Screen />, { path: "/1/cases/5", frame: "page", wallet });
    await waitFor(() => {
      expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 1 }));
    });
    const asked = switches.mock.calls.length;
    await user.click(pill("Ethereum Mainnet"));
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/cases/5");
    });
    expect(switches).toHaveBeenCalledTimes(asked);
  });

  it("keeps offering the switch to the page chain with its failure line when the wallet is elsewhere", async () => {
    const user = userEvent.setup();
    const wallet = await connected(1, true);
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page", wallet });
    const offer = await within(screen.getByRole("banner")).findByRole("button", { name: "Switch to Gnosis Network" });
    await user.click(offer);
    expect(await within(screen.getByRole("banner")).findByRole("alert")).toHaveTextContent("The switch to Gnosis Network was declined in the wallet.");
    expect(pill("Gnosis Network")).toBeInTheDocument();
  });

  it("opens on the current chain and moves with the arrow keys, Escape returns focus to the pill, Tab closes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    const trigger = pill("Gnosis Network");
    trigger.focus();
    await user.keyboard("{Enter}");
    const [ethereum, gnosis] = menuItems();
    expect(gnosis).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(ethereum).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(gnosis).toHaveFocus();
    await user.keyboard("{Home}");
    expect(ethereum).toHaveFocus();
    await user.keyboard("{End}");
    expect(gnosis).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu", { name: "Network" })).toBeInTheDocument();
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("without a wallet, Space on a chain moves the page to it like Enter does, without scrolling the page", async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<Screen />, { path: "/1/cases/55?tab=evidence#e", frame: "page" });
    const trigger = pill("Ethereum Mainnet");
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");
    const gnosis = screen.getByRole("menuitem", { name: "Gnosis Network" });
    expect(gnosis).toHaveFocus();
    expect(fireEvent.keyDown(gnosis, { key: " " })).toBe(false);
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/cases/55?tab=evidence#e");
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(pill("Gnosis Network")).toHaveFocus();
  });

  it("a press outside closes the menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    await user.click(pill("Ethereum Mainnet"));
    expect(screen.getByRole("menu", { name: "Network" })).toBeInTheDocument();
    await user.click(screen.getByText("Screen content"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
