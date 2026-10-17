import { CHAINS } from "@dispute-resolver/core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderAtPath } from "../test/routing";
import { createTestWallet, walletWrapper } from "../test/wallet";
import { NotFoundScreen } from "./NotFoundScreen";

function Unreachable() {
  return <p>Unreachable page</p>;
}

describe("UnsupportedNetworkScreen (spec §2.5, P-03)", () => {
  it("spec §2.5: lists every configured chain as NAME (id) in ascending order", () => {
    renderAtPath(<Unreachable />, "/10/ongoing");
    expect(screen.getByRole("heading", { level: 1, name: "Unsupported Network 10" })).toBeInTheDocument();
    expect(screen.getByText("Please switch over one of the following networks.")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Supported networks" });
    const labels = within(list)
      .getAllByRole("button")
      .map((button) => button.textContent);
    const expected = Object.values(CHAINS)
      .map((chain) => chain.id)
      .sort((left, right) => left - right)
      .map((id) => `${CHAINS[id]?.name ?? ""} (${String(id)})`);
    expect(labels).toEqual(expected);
    expect(labels).toHaveLength(14);
    expect(screen.queryByText("Unreachable page")).not.toBeInTheDocument();
  });

  it("P-13: a URL on chain 690 (Redstone, dropped) shows the unsupported-network state and does not offer 690", () => {
    renderAtPath(<Unreachable />, "/690/ongoing");
    expect(screen.getByRole("heading", { level: 1, name: "Unsupported Network 690" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Supported networks" });
    const labels = within(list)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels.filter((label) => label.includes("(690)") || label.includes("Redstone"))).toEqual([]);
    expect(screen.queryByText("Unreachable page")).not.toBeInTheDocument();
  });

  it("spec §2.5: the entries are buttons with accessible names, never navigation links", () => {
    renderAtPath(<Unreachable />, "/10/ongoing");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Switch the wallet to Gnosis Network (100)" })).toBeInTheDocument();
  });

  it("P-03: without a wallet, a switch shows an inline message instead of failing silently", async () => {
    const user = userEvent.setup();
    const view = renderAtPath(<Unreachable />, "/10/ongoing");
    await user.click(screen.getByRole("button", { name: "Switch the wallet to Gnosis Network (100)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connect a wallet to switch to Gnosis Network.");
    expect(view.currentPath()).toBe("/10/ongoing");
  });

  it("P-03: a switch declined in the wallet is shown inline", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet({ chainId: 10, switchChainError: true });
    await wallet.connect();
    const view = renderAtPath(<Unreachable />, "/10/ongoing", { wallet });
    await user.click(screen.getByRole("button", { name: "Switch the wallet to Gnosis Network (100)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The switch to Gnosis Network was declined in the wallet.");
    expect(view.currentPath()).toBe("/10/ongoing");
  });

  it("D-55: a successful switch moves the wallet and the app follows it to the chosen chain", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet({ chainId: 10 });
    await wallet.connect();
    const view = renderAtPath(<p>Ongoing page</p>, "/10/ongoing", { wallet });
    await user.click(screen.getByRole("button", { name: "Switch the wallet to Gnosis Network (100)" }));
    expect(await screen.findByText("Ongoing page")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
    expect(wallet.config.state.chainId).toBe(100);
  });

  it("P-03: the chain being switched to shows progress and the others wait", async () => {
    const wallet = createTestWallet({ chainId: 10 });
    await wallet.connect();
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

describe("NotFoundScreen (spec §2.6)", () => {
  it("spec §2.6: shows 404, the Athens message and the decorative illustration", () => {
    const view = render(<NotFoundScreen />, { wrapper: walletWrapper(createTestWallet()) });
    expect(screen.getByRole("heading", { level: 1, name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Something went wrong in Athens!")).toBeInTheDocument();
    const illustration = view.container.querySelector("img");
    expect(illustration).not.toBeNull();
    expect(illustration?.getAttribute("alt")).toBe("");
    expect(illustration?.getAttribute("src")).toMatch(/acropolis/);
  });
});
