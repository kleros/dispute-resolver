import type { WriteRefusal } from "@dispute-resolver/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TEST_TX_HASH, createTestWallet, testReceipt, walletWrapper } from "../test/wallet";
import type { WriteStatus } from "./types";
import { WriteStatusNotice } from "./WriteStatusNotice";

const EXPLORER = `https://etherscan.io/tx/${TEST_TX_HASH}`;

function renderNotice(status: WriteStatus, wallet = createTestWallet()) {
  return render(<WriteStatusNotice status={status} />, { wrapper: walletWrapper(wallet) });
}

describe("WriteStatusNotice", () => {
  it("§6.1: idle renders nothing", () => {
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
  ])("D-14: the %s status renders its alert", (_phase, status, title) => {
    renderNotice(status);
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it("D-07: a failure is announced as an error with its message", () => {
    renderNotice({ phase: "failed", hash: null, explorerUrl: null, message: "insufficient funds for gas" });
    expect(screen.getByRole("alert")).toHaveTextContent("insufficient funds for gas");
  });

  it("D-07: a rejected signature is not shown as an error", () => {
    renderNotice({ phase: "rejected" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("You declined the transaction in your wallet. Nothing was sent.")).toBeInTheDocument();
  });

  it.each<WriteStatus>([
    { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: EXPLORER },
    { phase: "mined", hash: TEST_TX_HASH, explorerUrl: EXPLORER, receipt: testReceipt() },
    { phase: "failed", hash: TEST_TX_HASH, explorerUrl: EXPLORER, message: "The transaction reverted." },
  ])("D-40: links the $phase transaction to the chain's explorer", (status) => {
    renderNotice(status);
    expect(screen.getByRole("link", { name: "View the transaction on the block explorer" })).toHaveAttribute("href", EXPLORER);
  });

  it("D-40: no explorer link without an explorer URL", () => {
    renderNotice({ phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null });
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("D-48: the wrong-chain refusal names both chains and offers the switch again", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    await wallet.connect();
    renderNotice({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, wallet);
    expect(screen.getByText(/Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Switch to Ethereum Mainnet" }));
    expect(await screen.findByText("Your wallet is now on Ethereum Mainnet. Try again.")).toBeInTheDocument();
  });

  it("P-03: a declined switch from the refusal is shown inline", async () => {
    const wallet = createTestWallet({ chainId: 100, switchChainError: true });
    await wallet.connect();
    renderNotice({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, wallet);
    await userEvent.click(screen.getByRole("button", { name: "Switch to Ethereum Mainnet" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The switch to Ethereum Mainnet was declined in the wallet.");
    });
  });

  it("D-48: needs-wallet offers Connect on the page chain", async () => {
    const wallet = createTestWallet();
    renderNotice({ phase: "needs-wallet", pageChainId: 100 }, wallet);
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(100);
  });

  it("K-02: needs-wallet without a project ID explains that connection is not configured", () => {
    renderNotice({ phase: "needs-wallet" }, createTestWallet({ mode: "unconfigured" }));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Wallet connection is not configured on this deployment.")).toBeInTheDocument();
  });

  it("K-03: needs-wallet with an embedded-wallet connector registered explains that connection is misconfigured", async () => {
    const wallet = createTestWallet({ embeddedWallet: true });
    renderNotice({ phase: "needs-wallet", pageChainId: 1 }, wallet);
    expect(await screen.findByText("Wallet connection is misconfigured on this deployment.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
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
  ])("D-07: the %s refusal has its own message", (refusal) => {
    renderNotice({ phase: "refused", refusal });
    expect(screen.getByRole("alert").textContent.length).toBeGreaterThan("Action unavailable".length);
  });

  it("D-51: a sequence shows which transaction the status belongs to", () => {
    render(<WriteStatusNotice status={{ phase: "pending" }} progress={{ index: 1, total: 3 }} />, { wrapper: walletWrapper(createTestWallet()) });
    expect(screen.getByText("Waiting for your wallet (2 of 3)")).toBeInTheDocument();
  });
});
