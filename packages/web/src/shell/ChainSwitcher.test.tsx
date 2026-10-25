import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/shell";
import { createTestWallet, holdChainSwitches, type TestWallet } from "../test/wallet";

function Screen() {
  return <p>Screen content</p>;
}

function pill(chainName: string) {
  return within(screen.getByRole("banner")).getByRole("button", { name: `Network: ${chainName}. Change network` });
}

function menuItems() {
  return within(screen.getByRole("menu", { name: "Network" })).getAllByRole("menuitem");
}

/** The panel of the open or closing menu: the element that animates. */
function menuPanel(): HTMLElement {
  const panel = screen.getByRole("menu", { name: "Network" }).parentElement;
  if (panel === null) throw new Error("The menu has no panel.");
  return panel;
}

/** A closed menu first animates out, inert; jsdom runs no animation, so the test ends it before checking the unmount. */
function expectMenuClosed() {
  const menu = screen.queryByRole("menu");
  if (menu?.parentElement) {
    expect(menu.parentElement).toHaveAttribute("inert");
    fireEvent.animationEnd(menu.parentElement);
  }
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
}

function spySwitches(wallet: TestWallet) {
  const [connector] = wallet.config.connectors;
  if (connector === undefined) throw new Error("The test wallet has no connector.");
  return vi.spyOn(connector, "switchChain");
}

/** The pill on the unsupported-network screen, which names no chain. */
function unsupportedPill() {
  return within(screen.getByRole("banner")).getByRole("button", { name: "Network: unsupported. Change network" });
}

function notifications() {
  return within(screen.getByRole("region", { name: "Notifications" }));
}

function toastsShown() {
  return [...notifications().queryAllByRole("status"), ...notifications().queryAllByRole("alert")];
}

/** The chain dot at the start of the pill. */
function dot(trigger: HTMLElement): Element | null {
  return trigger.querySelector("[aria-hidden=true]");
}

async function connected(chainId: number, switchChainError?: boolean | Error) {
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
    expectMenuClosed();
    expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
    expect(switches).not.toHaveBeenCalled();
    expect(pill("Gnosis Network")).toHaveFocus();
  });

  it("on the unsupported-network screen the pill says the network is unsupported, with a neutral dot and no chain checked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/999/ongoing", frame: "page" });
    const trigger = unsupportedPill();
    expect(trigger).toHaveTextContent(/^Unsupported Network$/);
    expect(within(screen.getByRole("banner")).queryByText("Ethereum Mainnet")).not.toBeInTheDocument();
    expect(dot(trigger)).toHaveClass("bg-current/50");
    await user.click(trigger);
    for (const item of menuItems()) expect(item).not.toHaveAttribute("aria-current");
  });

  it("on the 404 screen of a configured chain the pill keeps the chain's name", () => {
    renderWithProviders(<Screen />, { path: "/100/nowhere", frame: "page" });
    expect(pill("Gnosis Network")).toHaveTextContent("Gnosis Network");
  });

  it("on the unsupported-network screen choosing a chain replaces the bad segment", async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<Screen />, { path: "/abc/ongoing", frame: "page" });
    await user.click(unsupportedPill());
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
    await user.click(unsupportedPill());
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
    await user.click(unsupportedPill());
    await user.click(screen.getByRole("menuitem", { name: "Ethereum Mainnet" }));
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 1 }));
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(1);
    });
    await waitFor(() => {
      expect(view.currentPath()).toBe("/1/cases/5?x=1#y");
    });
  });

  it("with a wallet connected, choosing a chain on a list page asks the wallet and the page follows it, keeping the search and hash", async () => {
    const user = userEvent.setup();
    const wallet = await connected(1);
    const switches = spySwitches(wallet);
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing?period=4#list", frame: "page", wallet });
    await user.click(pill("Ethereum Mainnet"));
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 100 }));
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(100);
    });
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing?period=4#list");
    });
    expect(toastsShown()).toEqual([]);
  });

  it("on a case page, a chain the wallet switches to from the pill opens that chain's Ongoing Disputes", async () => {
    const user = userEvent.setup();
    const wallet = await connected(1);
    const view = renderWithProviders(<Screen />, { path: "/1/cases/5?tab=evidence#e", frame: "page", wallet });
    await user.click(pill("Ethereum Mainnet"));
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    await waitFor(() => {
      expect(view.currentPath()).toBe("/100/ongoing");
    });
    expect(wallet.config.state.chainId).toBe(100);
    expect(toastsShown()).toEqual([]);
  });

  it("a switch declined from the pill changes nothing and shows no toast", async () => {
    const user = userEvent.setup();
    const wallet = await connected(1, true);
    const switches = spySwitches(wallet);
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page", wallet });
    await user.click(pill("Ethereum Mainnet"));
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    await waitFor(() => {
      expect(switches).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.currentPath()).toBe("/1/ongoing");
    expect(wallet.config.state.chainId).toBe(1);
    expect(pill("Ethereum Mainnet")).not.toHaveAttribute("aria-busy");
    expect(toastsShown()).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a switch from the pill that fails shows an error toast with the reason and the page stays", async () => {
    const user = userEvent.setup();
    const wallet = await connected(1, new Error("Unrecognized chain ID"));
    const view = renderWithProviders(<Screen />, { path: "/1/cases/5", frame: "page", wallet });
    await user.click(pill("Ethereum Mainnet"));
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    const toast = await notifications().findByRole("alert");
    expect(toast).toHaveTextContent("Network not switched");
    expect(toast).toHaveTextContent(/Could not switch to Gnosis Network: .+\.$/);
    expect(toastsShown()).toHaveLength(1);
    expect(view.currentPath()).toBe("/1/cases/5");
    expect(wallet.config.state.chainId).toBe(1);
  });

  it("while any switch request waits in the wallet, the pill's chains take no press", async () => {
    const user = userEvent.setup();
    const wallet = await connected(1);
    const switches = spySwitches(wallet);
    holdChainSwitches(wallet);
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page", wallet });
    await user.click(pill("Ethereum Mainnet"));
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    expect(switches).toHaveBeenCalledTimes(1);
    expect(pill("Ethereum Mainnet")).toHaveAttribute("aria-busy", "true");
    await user.click(pill("Ethereum Mainnet"));
    for (const item of menuItems()) expect(item).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    await user.click(screen.getByRole("menuitem", { name: "Ethereum Mainnet" }));
    expect(switches).toHaveBeenCalledTimes(1);
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("while a switch request waits, the pill's dot dims and the chains look disabled with no hover fill", async () => {
    const user = userEvent.setup();
    const wallet = await connected(1);
    holdChainSwitches(wallet);
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page", wallet });
    const trigger = pill("Ethereum Mainnet");
    expect(trigger).toHaveClass("group", "aria-busy:cursor-progress");
    expect(dot(trigger)).toHaveClass("group-aria-busy:opacity-40");
    await user.click(trigger);
    for (const item of menuItems()) {
      expect(item).not.toHaveAttribute("aria-disabled");
      expect(item).toHaveClass("aria-disabled:opacity-50", "aria-disabled:hover:bg-transparent");
    }
    await user.click(screen.getByRole("menuitem", { name: "Gnosis Network" }));
    expect(trigger).toHaveAttribute("aria-busy", "true");
    await user.click(trigger);
    for (const item of menuItems()) expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("the pill's dot is green on the page chain and has no warning shade with a wallet connected", async () => {
    const onPageChain = renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page", wallet: await connected(100) });
    expect(dot(pill("Gnosis Network"))).toHaveClass("bg-(--dr-success-bar)");
    onPageChain.unmount();

    // While the wallet has not answered the switch asked for at load, it is still on another chain than the page.
    const waiting = await connected(1);
    holdChainSwitches(waiting);
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page", wallet: waiting });
    const trigger = pill("Gnosis Network");
    await waitFor(() => {
      expect(trigger).toHaveAttribute("aria-busy", "true");
    });
    expect(dot(trigger)).toHaveClass("bg-(--dr-success-bar)");
    expect(dot(trigger)?.className).not.toMatch(/warning/);
  });

  it("on a testnet page the pill's accessible name carries the full chain name", () => {
    renderWithProviders(<Screen />, { path: "/11155111/ongoing", frame: "page" });
    const trigger = within(screen.getByRole("banner")).getByRole("button", { name: "Network: Ethereum Testnet Sepolia. Change network" });
    expect(trigger).toHaveTextContent("Ethereum Testnet Sepolia");
    expect(trigger).not.toHaveAttribute("title");
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
    expectMenuClosed();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu", { name: "Network" })).toBeInTheDocument();
    await user.keyboard("{Tab}");
    expectMenuClosed();
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
    expectMenuClosed();
    expect(pill("Gnosis Network")).toHaveFocus();
  });

  it("the menu floats on a Stroke border and the library's shadow token, like the library's dropdowns", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    await user.click(pill("Gnosis Network"));
    expect(menuPanel()).toHaveClass("border-klerosUIComponentsStroke", "shadow-default");
  });

  it("the menu grows from the corner it hangs from and fades out, inert, before it unmounts", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    const trigger = pill("Gnosis Network");
    await user.click(trigger);
    const panel = menuPanel();
    expect(panel).toHaveClass("animate-scale-in", "origin-top-left", "lg:origin-top-right");
    expect(panel).not.toHaveAttribute("inert");

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
    expect(panel).toHaveClass("animate-scale-out", "opacity-0", "pointer-events-none");
    expect(panel).not.toHaveClass("animate-scale-in");
    expect(panel).toHaveAttribute("inert");

    const [ethereum] = menuItems();
    if (ethereum === undefined) throw new Error("The menu has no items.");
    fireEvent.animationEnd(ethereum);
    expect(panel).toBeInTheDocument();
    fireEvent.animationEnd(panel);
    expect(panel).not.toBeInTheDocument();
  });

  it("a closing menu takes no keys, and reopening it starts a fresh menu on the current chain", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    const trigger = pill("Gnosis Network");
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");
    const closing = menuPanel();
    const [ethereum] = menuItems();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(ethereum).not.toHaveFocus();
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(closing).not.toBeInTheDocument();
    const reopened = menuPanel();
    expect(reopened).toHaveClass("animate-scale-in");
    expect(reopened).not.toHaveAttribute("inert");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(menuItems()[1]).toHaveFocus();
  });

  it("the chevron flips with the menu on the menu's clocks and the pill's fill eases, all still under reduced motion", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const trigger = pill("Ethereum Mainnet");
    expect(trigger).toHaveClass("transition-[background-color]", "duration-150", "motion-reduce:transition-none");
    const chevron = trigger.querySelector("svg");
    expect(chevron).toHaveClass("transition-transform", "duration-150", "motion-reduce:transition-none");
    expect(chevron).not.toHaveClass("-scale-y-100");
    await user.click(trigger);
    expect(chevron).toHaveClass("-scale-y-100", "duration-250");
    expect(chevron).not.toHaveClass("rotate-180");
    await user.keyboard("{Escape}");
    expect(chevron).toHaveClass("duration-150");
    expect(chevron).not.toHaveClass("-scale-y-100");
  });

  it("a press outside closes the menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    await user.click(pill("Ethereum Mainnet"));
    expect(screen.getByRole("menu", { name: "Network" })).toBeInTheDocument();
    await user.click(screen.getByText("Screen content"));
    expectMenuClosed();
  });
});
