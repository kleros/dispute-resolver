import { CHAINS } from "@dispute-resolver/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { numberToHex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDeps, type RpcHandler } from "../test/data";
import { renderWithProviders } from "../test/shell";
import { matchOnly } from "../test/matchMedia";
import { createConnectedTestWallet, createTestWallet } from "../test/wallet";
import { Countdown, XL_MEDIA_QUERY } from "../ui";

const VIEW_ONLY_SENTENCE = "View mode only: Actions that require an Ethereum account are disabled.";

function Screen() {
  return <p>Screen content</p>;
}

function PageAction({ onPress }: { readonly onPress: () => void }) {
  return (
    <button type="button" onClick={onPress}>
      Page action
    </button>
  );
}

function header() {
  return screen.getByRole("banner");
}

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
    expect(within(header()).getByRole("button", { name: /^Account 0x/ })).toBeInTheDocument();
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

  it("Connect opens the wallet's Connect view on the page chain", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet();
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page", wallet });
    await user.click(within(header()).getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(100);
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
    const swap = toggle.querySelector("[data-icon-swap]");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(swap).toHaveAttribute("data-state", "menu");
    const panelId = toggle.getAttribute("aria-controls") ?? "";
    expect(document.getElementById(panelId)).toHaveClass("hidden");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(swap).toHaveAttribute("data-state", "close");
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

  it("a press on the page while the menu is open only closes the menu, and the next press acts", async () => {
    const onPageAction = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<PageAction onPress={onPageAction} />, { path: "/1/ongoing", frame: "page" });
    const toggle = within(header()).getByRole("button", { name: "Menu" });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Page action" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(onPageAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Page action" }));
    expect(onPageAction).toHaveBeenCalledTimes(1);
  });

  it("from xl, where the navigation is inline, a menu left open on a narrower window keeps no press from the page", async () => {
    vi.stubGlobal("matchMedia", matchOnly([XL_MEDIA_QUERY]));
    const onPageAction = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<PageAction onPress={onPageAction} />, { path: "/1/ongoing", frame: "page" });
    await user.click(within(header()).getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: "Page action" }));
    expect(onPageAction).toHaveBeenCalledTimes(1);
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

  it("the closing menu panel stays inert, with its scrim, until its animation ends and it hides, and animates nothing from xl", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    expect(queryScrim()).toBeNull();
    await user.click(within(header()).getByRole("button", { name: "Menu" }));
    expect(menuPanel()).not.toHaveAttribute("inert");
    expect(queryScrim()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    const closing = menuPanel();
    expect(closing).toHaveClass("max-xl:animate-scale-out");
    expect(closing).toHaveAttribute("inert");
    expect(queryScrim()).toBeInTheDocument();
    for (const name of [...closing.classList].filter((value) => /animate-|opacity-0|pointer-events-none/.test(value))) {
      expect(name, "the inline navigation from xl carries no animation of its own").toMatch(/^max-xl:/);
    }
    fireEvent.animationEnd(closing);
    expect(menuPanel()).toHaveClass("hidden");
    expect(menuPanel()).not.toHaveAttribute("inert");
    expect(queryScrim()).toBeNull();
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
