import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate, type NavigateFunction } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { TEST_TX_HASH, createConnectedTestWallet, createTestWallet, testReceipt, walletWrapper, type TestWallet } from "../test/wallet";
import { useWriteObserver, type WriteAttempt, type WriteObserver, type WriteStatus, type WriteWording } from "../wallet";
import { ToastProvider } from "./ToastProvider";
import type { ToastInput } from "./types";
import { WriteToasts, movedGuardToast, resolvedGuardToast, writeToast } from "./writeToasts";

const EXPLORER = `https://etherscan.io/tx/${TEST_TX_HASH}`;
const LINK = { href: EXPLORER, label: "View the transaction on the block explorer" };
const WORDING: WriteWording = { doing: "funding “Red” with 336 xDai", done: "Funded “Red” with 336 xDai." };
const WRONG_CHAIN: WriteStatus = { phase: "wrong-chain", walletChainId: 100, pageChainId: 1 };
const NEEDS_WALLET: WriteStatus = { phase: "needs-wallet", pageChainId: 1 };
const PENDING: WriteStatus = { phase: "pending" };
const SUBMITTED: WriteStatus = { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: EXPLORER };
const MINED: WriteStatus = { phase: "mined", hash: TEST_TX_HASH, explorerUrl: EXPLORER, receipt: testReceipt() };
const REJECTED: WriteStatus = { phase: "rejected" };
const SWITCH = "Switch to Ethereum Mainnet";

describe("writeToast", () => {
  it("checking and idle show nothing", () => {
    expect(writeToast({ phase: "idle" }, WORDING)).toBeNull();
    expect(writeToast({ phase: "checking" }, WORDING)).toBeNull();
  });

  it("pending asks to confirm the action in the wallet, with no clock", () => {
    expect(writeToast(PENDING, WORDING)).toEqual<ToastInput>({
      variant: "sync",
      title: "Waiting for your wallet",
      message: "Confirm funding “Red” with 336 xDai in your wallet.",
      autoHideMs: null,
    });
  });

  it("submitted names the action and links the transaction, with no clock", () => {
    expect(writeToast(SUBMITTED, WORDING)).toEqual<ToastInput>({
      variant: "sync",
      title: "Transaction submitted",
      message: "Funding “Red” with 336 xDai. Waiting for it to be mined.",
      link: LINK,
      autoHideMs: null,
    });
  });

  it("mined states what was done, links it and closes after 10 seconds", () => {
    expect(writeToast(MINED, WORDING)).toEqual<ToastInput>({
      variant: "success",
      title: "Transaction confirmed",
      message: "Funded “Red” with 336 xDai.",
      link: LINK,
      autoHideMs: 10_000,
    });
  });

  it("a done read from the receipt names what the receipt shows", () => {
    const done = vi.fn(() => "Created dispute 42.");
    expect(writeToast(MINED, { doing: "creating the dispute", done })?.message).toBe("Created dispute 42.");
    expect(done).toHaveBeenCalledWith(testReceipt());
  });

  it("failed names the action and the reason, links a transaction it has, and stays", () => {
    expect(writeToast({ phase: "failed", hash: TEST_TX_HASH, explorerUrl: EXPLORER, message: "The transaction reverted." }, WORDING)).toEqual<ToastInput>({
      variant: "error",
      title: "Transaction failed",
      message: "Funding “Red” with 336 xDai failed. The transaction reverted.",
      link: LINK,
      autoHideMs: null,
    });
    expect(writeToast({ phase: "failed", hash: null, explorerUrl: null, message: "insufficient funds for gas" }, WORDING)).toEqual<ToastInput>({
      variant: "error",
      title: "Transaction failed",
      message: "Funding “Red” with 336 xDai failed. insufficient funds for gas",
      autoHideMs: null,
    });
  });

  it("a declined request is neutral and closes after 10 seconds", () => {
    expect(writeToast(REJECTED, WORDING)).toEqual<ToastInput>({
      variant: "sync",
      title: "Transaction cancelled",
      message: "You declined funding “Red” with 336 xDai in your wallet. Nothing was sent.",
      autoHideMs: 10_000,
    });
  });

  it("the check's ends and build refusals are errors that stay", () => {
    const error = (title: string, message: string): ToastInput => ({ variant: "error", title, message, autoHideMs: null });
    expect(writeToast({ phase: "refused-by-contract", reason: "Appeal period is over." }, WORDING)).toEqual(
      error("The contract would reject this transaction", "Nothing was sent for funding “Red” with 336 xDai. The contract's answer: “Appeal period is over.”"),
    );
    expect(writeToast({ phase: "refused-by-contract", reason: null }, WORDING)).toEqual(
      error("The contract would reject this transaction", "Nothing was sent for funding “Red” with 336 xDai."),
    );
    expect(writeToast({ phase: "insufficient-funds" }, WORDING)).toEqual(
      error("Balance too low", "Your wallet's balance does not cover funding “Red” with 336 xDai. Nothing was sent."),
    );
    expect(writeToast({ phase: "account-changed" }, WORDING)).toEqual(
      error("Transaction not sent", "Your wallet's account changed while funding “Red” with 336 xDai was checked. Nothing was sent. Try again."),
    );
    expect(writeToast({ phase: "refused", refusal: "funding-closed" }, WORDING)).toEqual(error("Action unavailable", "Funding for this ruling has closed, so nothing was sent."));
  });

  it("a wrong network says both chains and that nothing was sent, without asking for the switch the action row offers", () => {
    expect(writeToast(WRONG_CHAIN, WORDING)).toEqual<ToastInput>({
      variant: "error",
      title: "Wrong network",
      message: "Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet. Nothing was sent.",
      autoHideMs: null,
    });
  });

  it("a write without a wallet asks to connect one, with no clock", () => {
    expect(writeToast(NEEDS_WALLET, WORDING)).toEqual<ToastInput>({ variant: "sync", title: "Wallet required", message: "Connect a wallet to continue.", autoHideMs: null });
  });

  it("a sequence counts its transactions in the title and closes only after the last", () => {
    expect(writeToast(PENDING, WORDING, { index: 0, total: 2 })?.title).toBe("Waiting for your wallet (1 of 2)");
    expect(writeToast(MINED, WORDING, { index: 0, total: 2 })).toMatchObject({ title: "Transaction confirmed (1 of 2)", autoHideMs: null, link: LINK });
    expect(writeToast(MINED, WORDING, { index: 1, total: 2 })).toMatchObject({ title: "Transaction confirmed (2 of 2)", autoHideMs: 10_000 });
    expect(writeToast(MINED, WORDING, { index: 0, total: 1 })).toMatchObject({ title: "Transaction confirmed", autoHideMs: 10_000 });
  });

  it("a sequence that stops after a confirmed transaction says the earlier ones went through", () => {
    expect(writeToast(REJECTED, WORDING, { index: 1, total: 2 })?.message).toBe(
      "You declined funding “Red” with 336 xDai in your wallet. Nothing was sent. The first transaction went through.",
    );
    expect(writeToast({ phase: "failed", hash: null, explorerUrl: null, message: "The transaction reverted." }, WORDING, { index: 2, total: 3 })?.message).toBe(
      "Funding “Red” with 336 xDai failed. The transaction reverted. The first 2 transactions went through.",
    );
    expect(writeToast(WRONG_CHAIN, WORDING, { index: 1, total: 3 })?.message).toBe(
      "Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet. Nothing was sent. The first transaction went through.",
    );
    expect(writeToast(REJECTED, WORDING, { index: 0, total: 2 })?.message).toBe("You declined funding “Red” with 336 xDai in your wallet. Nothing was sent.");
  });

  it("a done that cannot be read from the receipt says the transaction was mined", () => {
    const done = () => {
      throw new Error("No log.");
    };
    expect(writeToast(MINED, { doing: "creating the dispute", done })).toMatchObject({ variant: "success", message: "The transaction was mined." });
  });

  it("a refusal after the app moved to another network says nothing was sent and offers no switch", () => {
    expect(movedGuardToast({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, WORDING)).toEqual<ToastInput>({
      variant: "error",
      title: "Wrong network",
      message: "Nothing was sent for funding “Red” with 336 xDai. The app has moved to another network.",
      autoHideMs: null,
    });
    expect(movedGuardToast({ phase: "needs-wallet", pageChainId: 1 }, WORDING)).toEqual<ToastInput>({
      variant: "sync",
      title: "Wallet required",
      message: "Nothing was sent for funding “Red” with 336 xDai. The app has moved to another network.",
      autoHideMs: 10_000,
    });
  });

  it("a switched network or a connected wallet is shown as done, asks for the press again and closes after 10 seconds", () => {
    expect(resolvedGuardToast({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, WORDING)).toEqual<ToastInput>({
      variant: "success",
      title: "Network switched",
      message: "Your wallet is now on Ethereum Mainnet. Try funding “Red” with 336 xDai again.",
      autoHideMs: 10_000,
    });
    expect(resolvedGuardToast({ phase: "needs-wallet", pageChainId: 1 }, WORDING)).toEqual<ToastInput>({
      variant: "success",
      title: "Wallet connected",
      message: "Try funding “Red” with 336 xDai again.",
      autoHideMs: 10_000,
    });
  });
});

interface Harness {
  readonly observe: WriteObserver;
  readonly navigate: NavigateFunction;
}

function Probe({ onRender }: { readonly onRender: (harness: Harness) => void }) {
  onRender({ observe: useWriteObserver(), navigate: useNavigate() });
  return null;
}

function renderWriteToasts(wallet: TestWallet, path = "/1/cases/5"): () => Harness {
  let latest: Harness | undefined;
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <WriteToasts>
          <Probe
            onRender={(harness) => {
              latest = harness;
            }}
          />
        </WriteToasts>
      </ToastProvider>
    </MemoryRouter>,
    { wrapper: walletWrapper(wallet) },
  );
  return () => {
    if (latest === undefined) throw new Error("The probe has not rendered.");
    return latest;
  };
}

function region() {
  return within(screen.getByRole("region", { name: "Notifications" }));
}

function toasts(): readonly HTMLElement[] {
  return [...screen.getByRole("region", { name: "Notifications" }).querySelectorAll<HTMLElement>(":scope > output")];
}

function report(attempt: WriteAttempt, status: WriteStatus, progress?: { readonly index: number; readonly total: number }): void {
  act(() => {
    attempt.report(status, WORDING, progress);
  });
}

function navigateTo(harness: () => Harness, path: string): void {
  act(() => {
    void harness().navigate(path);
  });
}

describe("WriteToasts", () => {
  it("one press is one toast, updated in place through its phases", async () => {
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 1 }));
    const attempt = harness().observe("fund");
    report(attempt, { phase: "checking" });
    expect(toasts()).toHaveLength(0);
    report(attempt, PENDING);
    expect(region().getByText("Waiting for your wallet")).toBeInTheDocument();
    const [toast] = toasts();
    report(attempt, SUBMITTED);
    expect(toasts()).toEqual([toast]);
    expect(region().getByText("Transaction submitted")).toBeInTheDocument();
    expect(region().getByRole("link", { name: LINK.label })).toHaveAttribute("href", EXPLORER);
    report(attempt, MINED);
    expect(toasts()).toEqual([toast]);
    expect(region().getByText("Transaction confirmed")).toBeInTheDocument();
    expect(region().getByText("Funded “Red” with 336 xDai.")).toBeInTheDocument();
  });

  it("a closed in-flight toast comes back with the outcome", async () => {
    const user = userEvent.setup();
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 1 }));
    const attempt = harness().observe("fund");
    report(attempt, PENDING);
    await user.click(region().getByRole("button", { name: "Dismiss notification" }));
    await waitFor(() => {
      expect(toasts()).toHaveLength(0);
    });
    report(attempt, MINED);
    expect(region().getByText("Transaction confirmed")).toBeInTheDocument();
    expect(toasts()).toHaveLength(1);
  });

  it("a second press of the same control replaces its refusal instead of stacking a copy", async () => {
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 100 }));
    report(harness().observe("fund"), WRONG_CHAIN);
    report(harness().observe("fund"), WRONG_CHAIN);
    expect(region().getAllByText("Wrong network")).toHaveLength(1);
    report(harness().observe("fund"), { phase: "refused-by-contract", reason: null });
    expect(toasts()).toHaveLength(1);
    const next = harness().observe("fund");
    report(next, { phase: "checking" });
    report(next, PENDING);
    expect(toasts()).toHaveLength(1);
    expect(region().getByText("Waiting for your wallet")).toBeInTheDocument();
  });

  it("a second press keeps a confirmed transaction's toast and opens a new one", async () => {
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 1 }));
    const first = harness().observe("fund");
    for (const status of [PENDING, SUBMITTED, MINED]) report(first, status);
    report(harness().observe("fund"), PENDING);
    expect(toasts()).toHaveLength(2);
    expect(region().getByText("Transaction confirmed")).toBeInTheDocument();
    expect(region().getByText("Waiting for your wallet")).toBeInTheDocument();
  });

  it("a second press keeps a withdrawal toast that stopped after a confirmed transaction and opens a new one", async () => {
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 1 }));
    const first = harness().observe("withdraw");
    for (const status of [PENDING, SUBMITTED, MINED]) report(first, status, { index: 0, total: 2 });
    report(first, REJECTED, { index: 1, total: 2 });
    expect(region().getByText("Transaction cancelled (2 of 2)")).toBeInTheDocument();
    expect(region().getByText(/The first transaction went through\.$/)).toBeInTheDocument();
    report(harness().observe("withdraw"), PENDING, { index: 0, total: 1 });
    expect(toasts()).toHaveLength(2);
    expect(region().getByText("Transaction cancelled (2 of 2)")).toBeInTheDocument();
  });

  it("presses of two controls give two toasts", async () => {
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 100 }));
    report(harness().observe("fund-red"), WRONG_CHAIN);
    report(harness().observe("fund-blue"), WRONG_CHAIN);
    expect(region().getAllByText("Wrong network")).toHaveLength(2);
  });

  it("a wrong-network refusal carries a live switch and becomes a fact once the wallet reaches the page chain", async () => {
    const user = userEvent.setup();
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 100 }));
    report(harness().observe("fund"), WRONG_CHAIN);
    const [toast] = toasts();
    expect(toast).not.toHaveAttribute("role", "alert");
    await user.click(region().getByRole("button", { name: SWITCH }));
    expect(await region().findByText("Network switched")).toBeInTheDocument();
    expect(region().getByText("Your wallet is now on Ethereum Mainnet. Try funding “Red” with 336 xDai again.")).toBeInTheDocument();
    expect(region().queryByText("Wrong network")).toBeNull();
    expect(region().queryByRole("button", { name: SWITCH })).toBeNull();
    expect(toasts()).toEqual([toast]);
  });

  it("a refusal without a wallet carries a live Connect and becomes a fact once a wallet connects", async () => {
    const wallet = createTestWallet();
    const harness = renderWriteToasts(wallet);
    report(harness().observe("fund"), NEEDS_WALLET);
    expect(region().getByRole("button", { name: "Connect" })).toBeInTheDocument();
    await act(async () => {
      await wallet.connect();
    });
    expect(await region().findByText("Wallet connected")).toBeInTheDocument();
    expect(region().getByText("Try funding “Red” with 336 xDai again.")).toBeInTheDocument();
    expect(region().queryByRole("button", { name: "Connect" })).toBeNull();
  });

  it("a refusal toast closes when the page moves to another chain", async () => {
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 100 }));
    report(harness().observe("fund"), WRONG_CHAIN);
    navigateTo(harness, "/1/cases/6");
    expect(region().getByText("Wrong network")).toBeInTheDocument();
    navigateTo(harness, "/100/cases/5");
    await waitFor(() => {
      expect(toasts()).toHaveLength(0);
    });
  });

  it("a withdrawal refused after a confirmed transaction keeps its toast when the page moves to another chain, with no switch", async () => {
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 100 }));
    const attempt = harness().observe("withdraw");
    for (const status of [PENDING, SUBMITTED, MINED]) report(attempt, status, { index: 0, total: 2 });
    report(attempt, WRONG_CHAIN, { index: 1, total: 2 });
    expect(region().getByRole("button", { name: SWITCH })).toBeInTheDocument();
    navigateTo(harness, "/100/cases/5");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(toasts()).toHaveLength(1);
    expect(region().getByText("Wrong network (2 of 2)")).toBeInTheDocument();
    expect(region().getByText("Nothing was sent for funding “Red” with 336 xDai. The app has moved to another network. The first transaction went through.")).toBeInTheDocument();
    expect(region().queryByRole("button", { name: SWITCH })).toBeNull();
  });

  it("a network-switched fact stays when the page later moves to another chain", async () => {
    const user = userEvent.setup();
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 100 }));
    report(harness().observe("fund"), WRONG_CHAIN);
    await user.click(region().getByRole("button", { name: SWITCH }));
    expect(await region().findByText("Network switched")).toBeInTheDocument();
    navigateTo(harness, "/100/cases/5");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(region().getByText("Network switched")).toBeInTheDocument();
  });

  it("a waiting toast whose wallet answers with a wrong network after the page moved to another chain says nothing was sent, with no switch", async () => {
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 100 }));
    const attempt = harness().observe("fund");
    report(attempt, PENDING);
    navigateTo(harness, "/100/cases/5");
    report(attempt, WRONG_CHAIN);
    expect(toasts()).toHaveLength(1);
    expect(region().getByText("Wrong network")).toBeInTheDocument();
    expect(region().getByText("Nothing was sent for funding “Red” with 336 xDai. The app has moved to another network.")).toBeInTheDocument();
    expect(region().queryByRole("button", { name: SWITCH })).toBeNull();
    navigateTo(harness, "/137/cases/5");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(region().getByText("Wrong network")).toBeInTheDocument();
  });

  it("a transaction toast stays when the page changes", async () => {
    const harness = renderWriteToasts(await createConnectedTestWallet({ chainId: 1 }));
    report(harness().observe("fund"), SUBMITTED);
    navigateTo(harness, "/100/ongoing");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(region().getByText("Transaction submitted")).toBeInTheDocument();
  });
});
