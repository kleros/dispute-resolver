import { CHAINS } from "@dispute-resolver/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/shell";
import { createTestWallet } from "../test/wallet";

function Screen() {
  return <p>Screen content</p>;
}

function header() {
  return screen.getByRole("banner");
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

describe("PageFrame header (spec §2.3)", () => {
  it("spec §2.3: renders the screen between the header and the footer", () => {
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    expect(within(screen.getByRole("main")).getByText("Screen content")).toBeInTheDocument();
    expect(header()).toBeInTheDocument();
    expect(footer()).toBeInTheDocument();
  });

  it("spec §2.3: the brand links to the chain root and the navigation to Ongoing and Interact", () => {
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    expect(within(header()).getByRole("link", { name: "Kleros Dispute Resolver" })).toHaveAttribute("href", "/100");
    expect(navLinks().getByRole("link", { name: "Ongoing Disputes" })).toHaveAttribute("href", "/100/ongoing");
    expect(navLinks().getByRole("link", { name: "Interact" })).toHaveAttribute("href", "/100/cases");
  });

  it("spec §2.3: marks the link of the current page", () => {
    renderWithProviders(<Screen />, { path: "/1/cases/5", frame: "page" });
    expect(navLinks().getByRole("link", { name: "Interact" })).toHaveAttribute("aria-current", "page");
    expect(navLinks().getByRole("link", { name: "Ongoing Disputes" })).not.toHaveAttribute("aria-current");
  });

  it("spec §2.3: Create is shown only while a wallet is connected", async () => {
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    expect(navLinks().queryByRole("link", { name: "Create" })).not.toBeInTheDocument();
    await act(() => view.wallet.connect());
    expect(navLinks().getByRole("link", { name: "Create" })).toHaveAttribute("href", "/1/create");
  });

  it("spec §2.3: shows the view-only banner with the Metamask link only while no wallet is connected", async () => {
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const banner = screen.getByRole("note", { name: "View mode only" });
    expect(banner).toHaveTextContent("View mode only: Actions that require an Ethereum account are disabled. To use them, connect a wallet such as Metamask.");
    expectExternal(within(banner).getByRole("link", { name: "Metamask" }), "https://metamask.io");
    await act(() => view.wallet.connect());
    expect(screen.queryByRole("note", { name: "View mode only" })).not.toBeInTheDocument();
  });

  it("D-06: loads read-only, offers Connect and opens no wallet prompt by itself", () => {
    const wallet = createTestWallet();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page", wallet });
    expect(within(header()).getByRole("button", { name: "Connect" })).toBeEnabled();
    expect(screen.getByRole("note", { name: "View mode only" })).toBeInTheDocument();
    expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
    expect(wallet.config.state.status).toBe("disconnected");
  });

  it("D-06: Connect opens the wallet's Connect view on the page chain", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet();
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page", wallet });
    await user.click(within(header()).getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(100);
  });

  it("§11.2: the header shows the resolved chain and the connected account", async () => {
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    expect(within(header()).getByText("Ethereum Mainnet")).toBeInTheDocument();
    await act(() => view.wallet.connect());
    expect(within(header()).getByRole("button", { name: /^Account 0x/ })).toBeInTheDocument();
  });

  it("D-48: offers the switch to the page chain when the wallet is on another chain", async () => {
    const wallet = createTestWallet({ chainId: 1 });
    await wallet.connect();
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page", wallet });
    expect(within(header()).getByRole("button", { name: "Switch to Gnosis Network" })).toBeInTheDocument();
  });

  it("D-45: on the unsupported-network screen the header links use the default chain", () => {
    renderWithProviders(<Screen />, { path: "/999/ongoing", frame: "page" });
    expect(screen.getByRole("heading", { level: 1, name: "Unsupported Network 999" })).toBeInTheDocument();
    expect(within(header()).getByRole("link", { name: "Kleros Dispute Resolver" })).toHaveAttribute("href", "/1");
    expect(navLinks().getByRole("link", { name: "Ongoing Disputes" })).toHaveAttribute("href", "/1/ongoing");
    expect(navLinks().getByRole("link", { name: "Interact" })).toHaveAttribute("href", "/1/cases");
    for (const link of within(header()).getAllByRole("link")) expect(link.getAttribute("href")).not.toContain("undefined");
  });

  it("D-45: on the unsupported-network screen the header links follow a wallet on a configured chain", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    renderWithProviders(<Screen />, { path: "/abc/ongoing", frame: "page", wallet });
    expect(navLinks().getByRole("link", { name: "Ongoing Disputes" })).toHaveAttribute("href", "/100/ongoing");
    expect(navLinks().getByRole("link", { name: "Create" })).toHaveAttribute("href", "/100/create");
    expect(navLinks().getByRole("link", { name: "Interact" })).toHaveAttribute("href", "/100/cases");
  });

  it("D-45: on the 404 screen the header links use the URL's chain", () => {
    renderWithProviders(<Screen />, { path: "/100/nowhere", frame: "page" });
    expect(navLinks().getByRole("link", { name: "Ongoing Disputes" })).toHaveAttribute("href", "/100/ongoing");
  });

  it("§11.1: the menu button shows and hides the navigation below the lg breakpoint", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const toggle = within(header()).getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panelId = toggle.getAttribute("aria-controls") ?? "";
    expect(document.getElementById(panelId)).toHaveClass("hidden");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(panelId)).not.toHaveClass("hidden");
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("§11.1: following a link closes the menu", async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const toggle = within(header()).getByRole("button", { name: "Menu" });
    await user.click(toggle);
    await user.click(navLinks().getByRole("link", { name: "Interact" }));
    await waitFor(() => {
      expect(view.currentPath()).toBe("/1/cases");
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

describe("PageFrame footer (spec §2.4)", () => {
  const SOCIAL_LINKS: readonly (readonly [string, string])[] = [
    ["GitHub", "https://github.com/kleros/dispute-resolver"],
    ["Slack", "https://slack.kleros.io"],
    ["Reddit", "https://reddit.com/r/Kleros/"],
    ["Twitter", "https://twitter.com/kleros_io"],
    ["Kleros Forum", "https://forum.kleros.io"],
    ["Telegram", "https://t.me/kleros"],
    ["LinkedIn", "https://www.linkedin.com/company/kleros/"],
  ];

  it("spec §2.4: links Secured by Kleros, I need help and every social channel", () => {
    renderWithProviders(<Screen />, { path: "/1/ongoing", frame: "page" });
    const links = within(footer());
    expectExternal(links.getByRole("link", { name: "Secured by Kleros" }), "https://kleros.io");
    expectExternal(links.getByRole("link", { name: "I need help" }), "https://t.me/kleros");
    for (const [name, href] of SOCIAL_LINKS) expectExternal(links.getByRole("link", { name }), href);
  });

  it("spec §2.4: shows the resolved chain's name", () => {
    renderWithProviders(<Screen />, { path: "/100/ongoing", frame: "page" });
    expect(within(footer()).getByText("Gnosis Network")).toBeInTheDocument();
  });

  it("spec §2.4: shows Unsupported Network on the unsupported-network screen, without an explorer link", () => {
    renderWithProviders(<Screen />, { path: "/999/ongoing", frame: "page" });
    expect(within(footer()).getByText("Unsupported Network")).toBeInTheDocument();
    expect(within(footer()).queryByRole("link", { name: /explorer/ })).not.toBeInTheDocument();
  });

  it.each(Object.values(CHAINS).filter((chain) => chain.explorerBaseUrl !== undefined && chain.arbitrableProxy !== undefined))(
    "D-40: links the ArbitrableProxy on the explorer of $name",
    (chain) => {
      renderWithProviders(<Screen />, { path: `/${String(chain.id)}/ongoing`, frame: "page" });
      const link = within(footer()).getByRole("link", { name: `ArbitrableProxy contract on the ${chain.name} explorer` });
      expectExternal(link, `${chain.explorerBaseUrl ?? ""}/address/${chain.arbitrableProxy ?? ""}#code`);
    },
  );

  it.each(Object.values(CHAINS).filter((chain) => chain.explorerBaseUrl === undefined || chain.arbitrableProxy === undefined))(
    "D-40: shows no explorer link on $name, which has no ArbitrableProxy",
    (chain) => {
      renderWithProviders(<Screen />, { path: `/${String(chain.id)}/ongoing`, frame: "page" });
      expect(within(footer()).queryByRole("link", { name: /explorer/ })).not.toBeInTheDocument();
    },
  );
});
