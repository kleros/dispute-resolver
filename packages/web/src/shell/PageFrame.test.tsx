import { CHAINS } from "@dispute-resolver/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { numberToHex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDeps, type RpcHandler } from "../test/data";
import { renderWithProviders } from "../test/shell";
import { createConnectedTestWallet, createTestWallet } from "../test/wallet";
import { Countdown } from "../ui";

const VIEW_ONLY_SENTENCE = "View mode only: Actions that require an Ethereum account are disabled.";

function Screen() {
  return <p>Screen content</p>;
}

function header() {
  return screen.getByRole("banner");
}

/** The dimmed layer under the phone drawer, which carries no role or name. */
function queryScrim(): Element | null {
  return document.querySelector("div[aria-hidden='true'].fixed.inset-0");
}

function menuPanel(): HTMLElement {
  const panel = document.getElementById(within(header()).getByRole("button", { name: "Menu" }).getAttribute("aria-controls") ?? "");
  if (panel === null) throw new Error("The menu button controls no element.");
  return panel;
}

function footer() {
  return screen.getByRole("contentinfo");
}

function navLinks() {
  return within(screen.getByRole("navigation", { name: "Main" }));
}

function expectExternal(link: HTMLElement, href: string) {
  expect(link).toHaveAttribute("href", href);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
}

describe("PageFrame header", () => {
  it("links Ongoing Disputes, Case Lookup and Create in that order on every wallet state", async () => {
    const view = renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    const expectNavigation = () => {
      expect(within(header()).getByRole("link", { name: "Kleros Dispute Resolver" })).toHaveAttribute("href", "/100");
      const links = navLinks().getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["Ongoing Disputes", "Case Lookup", "Create"]);
      expect(links.map((link) => link.getAttribute("href"))).toEqual(["/100/ongoing", "/100/cases", "/100/create"]);
    };
    expectNavigation();
    await act(() => view.wallet.connect());
    expectNavigation();
  });

  it("marks the Case Lookup link on a case page", () => {
    renderWithProviders(<Screen />, { path: "/1/cases/5", frame: "page" });
    expect(navLinks().getByRole("link", { name: "Case Lookup" })).toHaveAttribute("aria-current", "page");
    expect(navLinks().getByRole("link", { name: "Ongoing Disputes" })).not.toHaveAttribute("aria-current");
  });

  it("shows the view-only banner with the Metamask link only while no wallet is connected", async () => {
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const banner = screen.getByRole("note", { name: "View mode only" });
    expect(banner).toHaveTextContent("View mode only: Actions that require an Ethereum account are disabled. To use them, connect a wallet such as Metamask.");
    expectExternal(within(banner).getByRole("link", { name: "Metamask" }), "https://metamask.io");
    await act(() => view.wallet.connect());
    expect(screen.queryByRole("note", { name: "View mode only" })).not.toBeInTheDocument();
  });

  it.each([
    { name: "without a project ID", options: { mode: "unconfigured" } as const },
    { name: "with an embedded-wallet connector registered", options: { embeddedWallet: true } },
  ])("$name the banner says that actions need an account and nothing else", async ({ options }) => {
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page", wallet: createTestWallet(options) });
    const banner = screen.getByRole("note", { name: "View mode only" });
    await waitFor(() => {
      expect(banner.textContent.trim()).toBe(VIEW_ONLY_SENTENCE);
    });
    expect(within(banner).queryByRole("link")).not.toBeInTheDocument();
  });

  it("loads read-only, offers Connect and opens no wallet prompt by itself", () => {
    const wallet = createTestWallet();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page", wallet });
    expect(within(header()).getByRole("button", { name: "Connect" })).toBeEnabled();
    expect(screen.getByRole("note", { name: "View mode only" })).toBeInTheDocument();
    expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
    expect(wallet.config.state.status).toBe("disconnected");
  });

  it("Connect opens the wallet's Connect view on the page chain", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet();
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page", wallet });
    await user.click(within(header()).getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(100);
  });

  it("the header shows the resolved chain on the pill and the connected account", async () => {
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    expect(within(header()).getByRole("button", { name: "Network: Ethereum Mainnet. Change network" })).toHaveTextContent("Ethereum Mainnet");
    await act(() => view.wallet.connect());
    expect(within(header()).getByRole("button", { name: /^Account 0x/ })).toBeInTheDocument();
  });

  it("with the wallet on another chain at load nothing is offered under the header: the app asks the wallet and, on a refusal, shows the wallet's chain", async () => {
    // The wallet declines the switch the app asks for at load, so it stays on Ethereum Mainnet.
    const wallet = await createConnectedTestWallet({ chainId: 1, switchChainError: true });
    const [connector] = wallet.config.connectors;
    if (connector === undefined) throw new Error("The test wallet has no connector.");
    const switches = vi.spyOn(connector, "switchChain");
    const view = renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page", wallet });
    await waitFor(() => {
      expect(view.currentPath()).toBe("/1/ongoing");
    });
    expect(switches).toHaveBeenCalledTimes(1);
    expect(switches).toHaveBeenCalledWith(expect.objectContaining({ chainId: 100 }));
    expect(within(header()).getByRole("button", { name: "Network: Ethereum Mainnet. Change network" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("Screen content")).toBeInTheDocument();
    expect(screen.queryByText(/^Your wallet is on /)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^Switch to (?!(dark|light) theme$)/ })).toEqual([]);
    expect(within(screen.getByRole("region", { name: "Notifications" })).getByRole("status")).toHaveTextContent("Wallet stayed on Ethereum Mainnet");
  });

  it("on the unsupported-network screen the header links use the default chain", () => {
    renderWithProviders(<Screen />, { path: "/999/ongoing", frame: "page" });
    expect(screen.getByRole("heading", { level: 1, name: "Unsupported Network 999" })).toBeInTheDocument();
    expect(within(header()).getByRole("link", { name: "Kleros Dispute Resolver" })).toHaveAttribute("href", "/1");
    expect(navLinks().getByRole("link", { name: "Ongoing Disputes" })).toHaveAttribute("href", "/1/ongoing");
    expect(navLinks().getByRole("link", { name: "Case Lookup" })).toHaveAttribute("href", "/1/cases");
    for (const link of within(header()).getAllByRole("link")) expect(link.getAttribute("href")).not.toContain("undefined");
  });

  it("on the unsupported-network screen the header links follow a wallet on a configured chain", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    renderWithProviders(<Screen />, { path: "/abc/ongoing", frame: "page", wallet });
    expect(navLinks().getByRole("link", { name: "Ongoing Disputes" })).toHaveAttribute("href", "/100/ongoing");
    expect(navLinks().getByRole("link", { name: "Create" })).toHaveAttribute("href", "/100/create");
    expect(navLinks().getByRole("link", { name: "Case Lookup" })).toHaveAttribute("href", "/100/cases");
  });

  it("on the 404 screen the header links use the URL's chain", () => {
    renderWithProviders(<Screen />, { path: "/100/nowhere", frame: "page" });
    expect(navLinks().getByRole("link", { name: "Ongoing Disputes" })).toHaveAttribute("href", "/100/ongoing");
  });

  it("the menu button shows and hides the navigation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const toggle = within(header()).getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panelId = toggle.getAttribute("aria-controls") ?? "";
    expect(document.getElementById(panelId)).toHaveClass("hidden");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(panelId)).not.toHaveClass("hidden");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("a press outside the bar and the menu panel closes the menu, and a press on the bar or inside the panel keeps it open", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const toggle = within(header()).getByRole("button", { name: "Menu" });
    await user.click(toggle);
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByRole("navigation", { name: "Main" }) });
    await user.pointer({ keys: "[MouseLeft]", target: within(header()).getByRole("link", { name: "Kleros Dispute Resolver" }).parentElement ?? header() });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByText("Screen content"));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).not.toHaveFocus();
  });

  it("following a link closes the menu", async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const toggle = within(header()).getByRole("button", { name: "Menu" });
    await user.click(toggle);
    await user.click(navLinks().getByRole("link", { name: "Case Lookup" }));
    await waitFor(() => {
      expect(view.currentPath()).toBe("/1/cases");
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("the chain pill, the theme toggle and Connect are outside the collapsible menu panel", () => {
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    const panel = menuPanel();
    expect(panel).toContainElement(screen.getByRole("navigation", { name: "Main" }));
    for (const control of [
      within(header()).getByRole("button", { name: /^Network:/ }),
      within(header()).getByRole("button", { name: /^Switch to (dark|light) theme$/ }),
      within(header()).getByRole("button", { name: "Connect" }),
    ]) {
      expect(panel).not.toContainElement(control);
    }
  });

  it("the header has a theme toggle beside the network pill", () => {
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    const pill = within(header()).getByRole("button", { name: /^Network:/ });
    const toggle = within(header()).getByRole("button", { name: "Switch to dark theme" });
    let cluster = toggle.parentElement;
    while (cluster !== null && !cluster.contains(pill)) cluster = cluster.parentElement;
    expect(cluster).toContainElement(within(header()).getByRole("button", { name: "Connect" }));
    expect(cluster).not.toContainElement(screen.getByRole("navigation", { name: "Main" }));
    expect(pill.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the menu panel grows in below xl and shrinks away inert, with its scrim, before it hides again, and animates nothing from xl", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    expect(queryScrim()).toBeNull();
    await user.click(within(header()).getByRole("button", { name: "Menu" }));
    const opened = menuPanel();
    expect(opened).toHaveClass("flex", "max-xl:animate-scale-in", "max-lg:origin-top", "lg:max-xl:origin-top-right");
    expect(opened).not.toHaveAttribute("inert");
    expect(queryScrim()).toHaveClass("animate-t-overlay-in");
    await user.keyboard("{Escape}");
    const closing = menuPanel();
    expect(closing).toHaveClass("flex", "max-xl:animate-scale-out", "max-xl:opacity-0", "max-xl:pointer-events-none");
    expect(closing).toHaveAttribute("inert");
    expect(queryScrim()).toHaveClass("animate-t-overlay-out");
    for (const name of [...closing.classList].filter((value) => /animate-|opacity-0|pointer-events-none/.test(value))) {
      expect(name, "the inline navigation from xl carries no animation of its own").toMatch(/^max-xl:/);
    }
    fireEvent.animationEnd(closing);
    expect(menuPanel()).toHaveClass("hidden");
    expect(menuPanel()).not.toHaveAttribute("inert");
    expect(queryScrim()).toBeNull();
  });

  it("the Menu button cross-fades its menu and close icons in one cell", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const toggle = within(header()).getByRole("button", { name: "Menu" });
    const swap = toggle.querySelector("[data-icon-swap]");
    if (swap === null) throw new Error("The Menu button has no icon swap.");
    const [menuIcon, closeIcon] = [...swap.querySelectorAll("svg")];
    expect(swap).toHaveAttribute("data-state", "menu");
    expect(menuIcon).toHaveClass("[grid-area:1/1]", "opacity-100", "scale-100", "motion-reduce:transition-none");
    expect(closeIcon).toHaveClass("[grid-area:1/1]", "opacity-0", "scale-25");
    await user.click(toggle);
    expect(swap).toHaveAttribute("data-state", "close");
    expect(menuIcon).toHaveClass("opacity-0", "scale-25");
    expect(closeIcon).toHaveClass("opacity-100", "scale-100");
  });
});

describe("PageFrame chain clock", () => {
  const CHAIN_SECONDS = 1_700_000_000;
  const HOUR = 3_600;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a countdown on a page counts from the page chain's block time when the browser clock is an hour off", async () => {
    vi.setSystemTime((CHAIN_SECONDS + HOUR) * 1000);
    const rpc = vi.fn<RpcHandler>(({ method }) => {
      if (method !== "eth_getBlockByNumber") throw new Error(`unexpected ${method}`);
      return { number: "0x10", timestamp: numberToHex(CHAIN_SECONDS), hash: `0x${"cd".repeat(32)}`, transactions: [] };
    });
    renderWithProviders(<Countdown target={CHAIN_SECONDS + 48 * HOUR} />, { path: "/100/ongoing", frame: "page", deps: createTestDeps({ rpc }) });
    const main = within(screen.getByRole("main"));
    expect(main.getByText("01d 23h 00m")).toBeInTheDocument();
    expect(await main.findByText("02d 00h 00m")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith({ chainId: 100, method: "eth_getBlockByNumber", params: ["latest", false] });
  });
});

describe("PageFrame footer", () => {
  const SOCIAL_LINKS: readonly (readonly [string, string])[] = [
    ["GitHub", "https://github.com/kleros/dispute-resolver"],
    ["Slack", "https://slack.kleros.io"],
    ["Reddit", "https://reddit.com/r/Kleros/"],
    ["Twitter", "https://twitter.com/kleros_io"],
    ["Kleros Forum", "https://forum.kleros.io"],
    ["Telegram", "https://t.me/kleros"],
    ["LinkedIn", "https://www.linkedin.com/company/kleros/"],
  ];

  it("links Secured by Kleros, I need help and every social channel", () => {
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const links = within(footer());
    expectExternal(links.getByRole("link", { name: "Secured by Kleros" }), "https://kleros.io");
    expectExternal(links.getByRole("link", { name: "I need help" }), "https://t.me/kleros");
    for (const [name, href] of SOCIAL_LINKS) expectExternal(links.getByRole("link", { name }), href);
  });

  it("shows the resolved chain's name", () => {
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    expect(within(footer()).getByText("Gnosis Network")).toBeInTheDocument();
  });

  it("is a centred column below the header's lg breakpoint and one row that never wraps from lg, where only the chain name may shrink", () => {
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const row = footer().firstElementChild;
    expect(row).toHaveClass("flex-col", "items-center", "lg:flex-row", "lg:flex-nowrap", "lg:justify-between");
    const classNames = Array.from(footer().querySelectorAll("[class]"), (element) => element.getAttribute("class") ?? "");
    expect(classNames.filter((name) => /(^|\s)sm:/.test(name))).toEqual([]);
    const chainName = within(footer()).getByText("Ethereum Mainnet");
    expect(chainName).toHaveClass("min-w-0", "truncate");
    expect(chainName.parentElement).toHaveClass("min-w-0", "flex-col", "items-center", "lg:flex-row");
    const channels = within(footer()).getByRole("list", { name: "Kleros channels" });
    expect(channels).toHaveClass("flex-wrap", "lg:flex-nowrap");
    expect(channels.parentElement).toHaveClass("shrink-0", "flex-col", "items-center", "lg:flex-row");
  });

  it("shows Unsupported Network on the unsupported-network screen, without an explorer link", () => {
    renderWithProviders(<Screen />, { path: "/999/ongoing", frame: "page" });
    expect(within(footer()).getByText("Unsupported Network")).toBeInTheDocument();
    expect(within(footer()).queryByRole("link", { name: /explorer/ })).not.toBeInTheDocument();
  });

  it.each(Object.values(CHAINS).filter((chain) => chain.arbitrableProxy !== undefined))("links the ArbitrableProxy on the explorer of $name", (chain) => {
    renderWithProviders(<Screen />, { path: `/${String(chain.id)}/ongoing`, frame: "page" });
    const link = within(footer()).getByRole("link", { name: `ArbitrableProxy contract on the ${chain.name} explorer` });
    expectExternal(link, `${chain.explorerBaseUrl}/address/${chain.arbitrableProxy ?? ""}#code`);
  });

  it.each(Object.values(CHAINS).filter((chain) => chain.arbitrableProxy === undefined))("shows no explorer link on $name, which has no ArbitrableProxy", (chain) => {
    renderWithProviders(<Screen />, { path: `/${String(chain.id)}/ongoing`, frame: "page" });
    expect(within(footer()).queryByRole("link", { name: /explorer/ })).not.toBeInTheDocument();
  });
});
