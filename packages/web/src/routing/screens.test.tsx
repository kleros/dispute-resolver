import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAtPath, renderInRouter } from "../test/routing";
import { createConnectedTestWallet } from "../test/wallet";
import { NotFoundScreen } from "./NotFoundScreen";

function Unreachable() {
  return <p>Unreachable page</p>;
}

describe("UnsupportedNetworkScreen", () => {
  it.each([
    [10, "an unconfigured chain"],
    [690, "a chain no longer supported"],
  ])("a URL on chain %i, %s, offers only Ethereum Mainnet and Gnosis, never a testnet or a chain without a court", (chainId) => {
    renderAtPath(<Unreachable />, `/${String(chainId)}/ongoing`);
    expect(screen.getByRole("heading", { level: 1, name: `Unsupported Network ${String(chainId)}` })).toBeInTheDocument();
    expect(screen.getByText("Please switch over one of the following networks.")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Supported networks" });
    const labels = within(list)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["Ethereum Mainnet (1)", "Gnosis Network (100)"]);
    expect(screen.queryByText("Unreachable page")).not.toBeInTheDocument();
  });

  it("the entries are buttons with accessible names, never navigation links", () => {
    renderAtPath(<Unreachable />, "/10/ongoing");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Switch the wallet to Gnosis Network (100)" })).toBeInTheDocument();
  });

  it("without a wallet, a switch shows an inline message instead of failing silently", async () => {
    const user = userEvent.setup();
    const view = renderAtPath(<Unreachable />, "/10/ongoing");
    await user.click(screen.getByRole("button", { name: "Switch the wallet to Gnosis Network (100)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connect a wallet to switch to Gnosis Network.");
    expect(view.currentPath()).toBe("/10/ongoing");
  });

  it("a switch declined in the wallet is shown inline", async () => {
    const user = userEvent.setup();
    const wallet = await createConnectedTestWallet({ chainId: 10, switchChainError: true });
    const view = renderAtPath(<Unreachable />, "/10/ongoing", { wallet });
    await user.click(screen.getByRole("button", { name: "Switch the wallet to Gnosis Network (100)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The switch to Gnosis Network was declined in the wallet.");
    expect(view.currentPath()).toBe("/10/ongoing");
  });

  it("a failed switch rises into view", async () => {
    const user = userEvent.setup();
    renderAtPath(<Unreachable />, "/10/ongoing");
    await user.click(screen.getByRole("button", { name: "Switch the wallet to Gnosis Network (100)" }));
    const alert = await screen.findByRole("alert");
    expect(alert.firstElementChild).toHaveClass("[&_h2]:animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_backwards]", "motion-reduce:[&_h2]:animate-none");
  });

  it("a successful switch moves the wallet and the app follows it to the chosen chain", async () => {
    const user = userEvent.setup();
    const wallet = await createConnectedTestWallet({ chainId: 10 });
    const view = renderAtPath(<p>Ongoing page</p>, "/10/ongoing", { wallet });
    await user.click(screen.getByRole("button", { name: "Switch the wallet to Gnosis Network (100)" }));
    expect(await screen.findByText("Ongoing page")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
    expect(wallet.config.state.chainId).toBe(100);
  });

  it("the chain being switched to shows progress and the others wait", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 10 });
    renderAtPath(<Unreachable />, "/10/ongoing", { wallet });
    const target = screen.getByRole("button", { name: "Switch the wallet to Gnosis Network (100)" });
    act(() => {
      target.click();
    });
    expect(screen.getByRole("button", { name: "Switch the wallet to Ethereum Mainnet (1)" })).toBeDisabled();
    await waitFor(() => {
      expect(wallet.config.state.chainId).toBe(100);
    });
  });
});

describe("NotFoundScreen", () => {
  it("shows 404, says the page was not found, keeps the Athens message and the decorative illustration", () => {
    const view = renderInRouter(<NotFoundScreen chainId={1} />, "/1/nowhere");
    expect(screen.getByRole("heading", { level: 1, name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong in Athens!")).toBeInTheDocument();
    const illustration = view.container.querySelector("img");
    expect(illustration).not.toBeNull();
    expect(illustration?.getAttribute("alt")).toBe("");
    expect(illustration?.getAttribute("src")).toMatch(/acropolis/);
  });

  it("offers a way forward to the Ongoing Disputes of the given chain", () => {
    renderInRouter(<NotFoundScreen chainId={100} />, "/100/nowhere");
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/100/ongoing");
  });
});
