import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createConnectedTestWallet, createTestWallet, holdChainSwitches, walletWrapper, type TestWallet } from "../test/wallet";
import { switchWalletChain } from "./switchChain";
import type { NeedsWalletGuard, WrongChainGuard } from "./types";
import { WriteGuardAction, WriteGuardNotice } from "./WriteGuard";

const WRONG_CHAIN: WrongChainGuard = { phase: "wrong-chain", walletChainId: 100, pageChainId: 1 };
const MISMATCH = "Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet.";
const ASK_SWITCH = "Switch your wallet to Ethereum Mainnet to continue.";
const SWITCH = "Switch to Ethereum Mainnet";
const SECONDARY_FACE = ["bg-klerosUIComponentsWhiteBackground", "border-klerosUIComponentsPrimaryBlue"];
/** The library paints every `p` in PrimaryText from its base layer, which beats the colour the toast's foot passes down. */
const TOAST_TEXT = "text-klerosUIComponentsWhiteBackground";

function renderNotice(guard: NeedsWalletGuard | WrongChainGuard, wallet: TestWallet) {
  return render(<WriteGuardNotice guard={guard} />, { wrapper: walletWrapper(wallet) });
}

function renderAction(guard: NeedsWalletGuard | WrongChainGuard, wallet: TestWallet) {
  const onResolved = vi.fn();
  const view = render(<WriteGuardAction guard={guard} onResolved={onResolved} />, { wrapper: walletWrapper(wallet) });
  return { ...view, onResolved };
}

async function walletWithSwitchWaiting(target: number): Promise<TestWallet> {
  const wallet = await createConnectedTestWallet({ chainId: 100 });
  holdChainSwitches(wallet);
  void switchWalletChain(wallet.config, target);
  return wallet;
}

describe("WriteGuardNotice", () => {
  it("the in-place guard words a wrong network as why the action is locked", async () => {
    const { container } = renderNotice(WRONG_CHAIN, await createConnectedTestWallet({ chainId: 100 }));
    expect(screen.getByText("Wrong network")).toBeInTheDocument();
    expect(screen.getByText(`${MISMATCH} ${ASK_SWITCH}`)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Nothing was sent");
    expect(screen.getByRole("button", { name: SWITCH })).toBeInTheDocument();
  });

  it.each([
    ["the page chain", 1, "A switch to Ethereum Mainnet is waiting in your wallet."],
    ["another chain", 11155111, "A switch to Ethereum Testnet Sepolia is waiting in your wallet."],
  ])("while a switch to %s waits, the guard gives way to a line naming it and no longer asks for the switch", async (_case, target, waitingLine) => {
    const { container } = renderNotice(WRONG_CHAIN, await walletWithSwitchWaiting(target));
    expect(screen.getByText(MISMATCH)).toBeInTheDocument();
    expect(screen.getByText(waitingLine)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Switch your wallet");
    expect(container).not.toHaveTextContent("Nothing was sent");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a switch the user starts from the notice turns the button into the waiting line", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    holdChainSwitches(wallet);
    renderNotice(WRONG_CHAIN, wallet);
    await userEvent.click(screen.getByRole("button", { name: SWITCH }));
    expect(await screen.findByText("A switch to Ethereum Mainnet is waiting in your wallet.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a declined switch from the refusal is shown inline", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100, switchChainError: true });
    renderNotice(WRONG_CHAIN, wallet);
    await userEvent.click(screen.getByRole("button", { name: SWITCH }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The switch to Ethereum Mainnet was declined in the wallet.");
    });
    expect(screen.getByRole("alert")).toHaveClass("text-klerosUIComponentsError");
    expect(screen.getByRole("button", { name: SWITCH })).toBeEnabled();
    expect(screen.getByText(`${MISMATCH} ${ASK_SWITCH}`)).toBeInTheDocument();
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
    expect(container.querySelector("[aria-live]")?.children).toHaveLength(1);
    expect(container).not.toHaveTextContent(/configured|deployment|unavailable/i);
  });
});

describe("WriteGuardAction", () => {
  it("the toast's switch reports once when the wallet reaches the page chain", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const { onResolved } = renderAction(WRONG_CHAIN, wallet);
    expect(onResolved).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: SWITCH }));
    await waitFor(() => {
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
    await act(() => wallet.changeChain(100));
    await act(() => wallet.changeChain(1));
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it("the toast's Connect reports once when a wallet connects", async () => {
    const wallet = createTestWallet();
    const { onResolved } = renderAction({ phase: "needs-wallet", pageChainId: 100 }, wallet);
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(100);
    expect(onResolved).not.toHaveBeenCalled();
    await act(() => wallet.connect());
    await waitFor(() => {
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
    await act(() => wallet.disconnect());
    await act(() => wallet.connect());
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it("the toast's buttons are the library's secondary variant", async () => {
    const switchView = renderAction(WRONG_CHAIN, await createConnectedTestWallet({ chainId: 100 }));
    expect(screen.getByRole("button", { name: SWITCH })).toHaveClass(...SECONDARY_FACE);
    switchView.unmount();
    renderAction({ phase: "needs-wallet", pageChainId: 1 }, createTestWallet());
    expect(screen.getByRole("button", { name: "Connect" })).toHaveClass(...SECONDARY_FACE);
  });

  it("a declined switch in the toast takes the toast's own text colour, since the error colour fails on its surface", async () => {
    renderAction(WRONG_CHAIN, await createConnectedTestWallet({ chainId: 100, switchChainError: true }));
    await userEvent.click(screen.getByRole("button", { name: SWITCH }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The switch to Ethereum Mainnet was declined in the wallet.");
    });
    expect(screen.getByRole("alert")).not.toHaveClass("text-klerosUIComponentsError");
    expect(screen.getByRole("alert")).toHaveClass("text-sm", TOAST_TEXT);
  });

  it("the toast's waiting line takes the toast's own text colour, not the library's paragraph colour", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    holdChainSwitches(wallet);
    renderAction(WRONG_CHAIN, wallet);
    await userEvent.click(screen.getByRole("button", { name: SWITCH }));
    expect(await screen.findByText("A switch to Ethereum Mainnet is waiting in your wallet.")).toHaveClass(TOAST_TEXT);
  });

  it("the toast's lines once the wallet can sign take the toast's own text colour", async () => {
    const switched = await createConnectedTestWallet({ chainId: 100 });
    const switchView = renderAction(WRONG_CHAIN, switched);
    await act(() => switched.changeChain(1));
    expect(screen.getByText("Your wallet is now on Ethereum Mainnet. Try again.")).toHaveClass(TOAST_TEXT);
    switchView.unmount();
    const connecting = createTestWallet();
    renderAction({ phase: "needs-wallet", pageChainId: 1 }, connecting);
    await act(() => connecting.connect());
    expect(await screen.findByText("Wallet connected. Try again.")).toHaveClass(TOAST_TEXT);
  });

  it("a wrong-network toast offers Connect, not a switch, once the wallet disconnects", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    const { onResolved } = renderAction(WRONG_CHAIN, wallet);
    expect(screen.getByRole("button", { name: SWITCH })).toBeInTheDocument();
    await act(() => wallet.disconnect());
    expect(await screen.findByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SWITCH })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(1);
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("the in-place guard keeps the page's own colours", async () => {
    const wallet = await createConnectedTestWallet({ chainId: 100 });
    holdChainSwitches(wallet);
    renderNotice(WRONG_CHAIN, wallet);
    await userEvent.click(screen.getByRole("button", { name: SWITCH }));
    expect(await screen.findByText("A switch to Ethereum Mainnet is waiting in your wallet.")).not.toHaveClass(TOAST_TEXT);
  });
});
