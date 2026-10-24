import type { ChainId, WriteRefusal } from "@dispute-resolver/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TEST_TX_HASH, createTestWallet, holdChainSwitches, testReceipt, walletWrapper } from "../test/wallet";
import { switchWalletChain } from "./switchChain";
import type { WriteStatus } from "./types";
import { WriteStatusNotice } from "./WriteStatusNotice";

const EXPLORER = `https://etherscan.io/tx/${TEST_TX_HASH}`;

function renderNotice(status: WriteStatus, wallet = createTestWallet()) {
  return render(<WriteStatusNotice status={status} />, { wrapper: walletWrapper(wallet) });
}

describe("WriteStatusNotice", () => {
  it("idle renders nothing", () => {
    const { container } = renderNotice({ phase: "idle" });
    expect(container).toBeEmptyDOMElement();
  });

  it.each<[string, WriteStatus, string]>([
    ["pending", { phase: "pending" }, "Waiting for your wallet"],
    ["submitted", { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: EXPLORER }, "Transaction submitted"],
    ["mined", { phase: "mined", hash: TEST_TX_HASH, explorerUrl: EXPLORER, receipt: testReceipt() }, "Transaction confirmed"],
    ["failed", { phase: "failed", hash: TEST_TX_HASH, explorerUrl: EXPLORER, message: "The transaction reverted." }, "Transaction failed"],
    ["rejected", { phase: "rejected" }, "Transaction cancelled"],
    ["refused", { phase: "refused", refusal: "appeal-unsupported" }, "Action unavailable"],
    ["needs-wallet", { phase: "needs-wallet", pageChainId: 1 }, "Wallet required"],
    ["wrong-chain", { phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, "Wrong network"],
  ])("the %s status renders its alert", (_phase, status, title) => {
    renderNotice(status);
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it("the status rises into view as it leaves idle, and a confirmed transaction plays the check", () => {
    const { container } = renderNotice({ phase: "mined", hash: TEST_TX_HASH, explorerUrl: EXPLORER, receipt: testReceipt() });
    const alert = screen.getByText("Transaction confirmed").closest("h2")?.parentElement?.parentElement;
    expect(alert).toHaveClass("[&_h2]:animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_backwards]", "[&_svg.fill-klerosUIComponentsSuccess]:animate-t-success-check");
    expect(container.querySelector("svg.fill-klerosUIComponentsSuccess")).not.toBeNull();
  });

  it("a failure is announced as an error with its message", () => {
    renderNotice({ phase: "failed", hash: null, explorerUrl: null, message: "insufficient funds for gas" });
    expect(screen.getByRole("alert")).toHaveTextContent("insufficient funds for gas");
  });

  it("a rejected signature is not shown as an error", () => {
    renderNotice({ phase: "rejected" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("You declined the transaction in your wallet. Nothing was sent.")).toBeInTheDocument();
  });

  it.each<WriteStatus>([
    { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: EXPLORER },
    { phase: "mined", hash: TEST_TX_HASH, explorerUrl: EXPLORER, receipt: testReceipt() },
    { phase: "failed", hash: TEST_TX_HASH, explorerUrl: EXPLORER, message: "The transaction reverted." },
  ])("links the $phase transaction to the chain's explorer", (status) => {
    renderNotice(status);
    expect(screen.getByRole("link", { name: "View the transaction on the block explorer" })).toHaveAttribute("href", EXPLORER);
  });

  it("no explorer link without an explorer URL", () => {
    renderNotice({ phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null });
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("the wrong-chain refusal names both chains and offers the switch again", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    renderNotice({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, wallet);
    expect(screen.getByText(/Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Switch to Ethereum Mainnet" }));
    expect(await screen.findByText("Your wallet is now on Ethereum Mainnet. Try again.")).toBeInTheDocument();
  });

  it("the wrong-chain notice shown after a refused write says that nothing was sent", () => {
    renderNotice({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 });
    expect(
      screen.getByText("Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet. Switch your wallet to Ethereum Mainnet to continue. Nothing was sent."),
    ).toBeInTheDocument();
  });

  it("the wrong-chain notice shown before any write asks for the switch without saying that nothing was sent", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    const { container } = render(<WriteStatusNotice status={{ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }} beforeAttempt />, {
      wrapper: walletWrapper(wallet),
    });
    expect(screen.getByText("Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet. Switch your wallet to Ethereum Mainnet to continue.")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Nothing was sent");
    expect(screen.getByRole("button", { name: "Switch to Ethereum Mainnet" })).toBeInTheDocument();
  });

  async function walletWithSwitchWaiting(target: ChainId = 1) {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    holdChainSwitches(wallet);
    void switchWalletChain(wallet.config, target);
    return wallet;
  }

  it("while a switch waits in the wallet, the switch button gives way to a line saying so and the notice no longer asks for the switch", async () => {
    const wallet = await walletWithSwitchWaiting();
    const { container } = renderNotice({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, wallet);
    expect(screen.getByText("A switch to Ethereum Mainnet is waiting in your wallet.")).toBeInTheDocument();
    expect(screen.getByText("Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet. Nothing was sent.")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Switch your wallet");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("while a switch waits in the wallet before any write, the notice does not say that nothing was sent", async () => {
    const wallet = await walletWithSwitchWaiting();
    const { container } = render(<WriteStatusNotice status={{ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }} beforeAttempt />, {
      wrapper: walletWrapper(wallet),
    });
    expect(screen.getByText("Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet.")).toBeInTheDocument();
    expect(screen.getByText("A switch to Ethereum Mainnet is waiting in your wallet.")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Nothing was sent");
  });

  it("the waiting line names the chain of the request that waits in the wallet", async () => {
    const wallet = await walletWithSwitchWaiting(11155111);
    renderNotice({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, wallet);
    expect(screen.getByText("A switch to Ethereum Testnet Sepolia is waiting in your wallet.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a switch the user starts from the notice turns the button into the waiting line", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    holdChainSwitches(wallet);
    renderNotice({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, wallet);
    await userEvent.click(screen.getByRole("button", { name: "Switch to Ethereum Mainnet" }));
    expect(await screen.findByText("A switch to Ethereum Mainnet is waiting in your wallet.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a declined switch from the refusal is shown inline", async () => {
    const wallet = createTestWallet({ chainId: 100, switchChainError: true });
    await wallet.connect();
    renderNotice({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, wallet);
    await userEvent.click(screen.getByRole("button", { name: "Switch to Ethereum Mainnet" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The switch to Ethereum Mainnet was declined in the wallet.");
    });
    expect(screen.getByRole("button", { name: "Switch to Ethereum Mainnet" })).toBeEnabled();
    expect(screen.getByText(/Switch your wallet to Ethereum Mainnet to continue\. Nothing was sent\.$/)).toBeInTheDocument();
  });

  it("needs-wallet offers Connect on the page chain", async () => {
    const wallet = createTestWallet();
    renderNotice({ phase: "needs-wallet", pageChainId: 100 }, wallet);
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(100);
  });

  it.each([
    ["without a project ID", { mode: "unconfigured" }],
    ["with an embedded-wallet connector registered", { embeddedWallet: true }],
  ] as const)("needs-wallet shows no Connect offer and no explanation when no wallet can connect (%s)", async (_case, options) => {
    const { container } = renderNotice({ phase: "needs-wallet", pageChainId: 1 }, createTestWallet(options));
    await waitFor(() => {
      expect(screen.queryByRole("button")).toBeNull();
    });
    expect(screen.getByText("Connect a wallet to continue.")).toBeInTheDocument();
    // The notice alone: no offer and no sentence under it.
    expect(container.querySelector("[aria-live]")?.children).toHaveLength(1);
    expect(container).not.toHaveTextContent(/configured|deployment|unavailable/i);
  });

  it.each<WriteRefusal>([
    "evidence-unsupported",
    "appeal-unsupported",
    "withdraw-unsupported",
    "local-id-unresolved",
    "not-content-addressed",
    "no-arbitrable-proxy",
    "ruling-out-of-range",
    "family-mismatch",
    "call-chain-mismatch",
  ])("the %s refusal has its own message", (refusal) => {
    renderNotice({ phase: "refused", refusal });
    expect(screen.getByRole("alert").textContent.length).toBeGreaterThan("Action unavailable".length);
  });

  it("a call prepared for another network than the page says so, and nothing was sent", () => {
    renderNotice({ phase: "refused", refusal: "call-chain-mismatch" });
    expect(screen.getByText("Action unavailable")).toBeInTheDocument();
    expect(screen.getByText("This action was prepared for a different network than this page, so nothing was sent.")).toBeInTheDocument();
  });

  it("a sequence shows which transaction the status belongs to", () => {
    render(<WriteStatusNotice status={{ phase: "pending" }} progress={{ index: 1, total: 3 }} />, { wrapper: walletWrapper(createTestWallet()) });
    expect(screen.getByText("Waiting for your wallet (2 of 3)")).toBeInTheDocument();
  });
});
