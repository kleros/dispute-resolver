import * as core from "@dispute-resolver/core";
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadResult } from "../../atlas";
import { fakeUploader, type FakeUploader } from "../../test/atlas";
import { testCourt } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import { createTestWallet, fakeWriteController, holdChainSwitches, installOfflineAppKitEnvironment, type FakeWriteController, type TestWallet } from "../../test/wallet";
import type { WriteController, WriteOutcome, WriteStatus } from "../../wallet";
import { CreateSummary } from "./CreateSummary";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const writes = vi.hoisted(() => ({ controller: null as FakeWriteController | null }));

vi.mock("../../wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../wallet")>();
  return {
    ...actual,
    useWrite: () => {
      if (writes.controller === null) throw new Error("No fake write controller for this test.");
      return writes.controller.useWrite();
    },
  };
});

const ETHEREUM = core.getChain(1);
if (ETHEREUM === undefined) throw new Error("Ethereum must be configured.");
const CHAIN = ETHEREUM;

const INPUT: core.CreateDisputeInput = {
  courtId: 0n,
  votes: 3n,
  category: "",
  title: "Rent deposit",
  description: "",
  questionType: "single-select",
  question: "Should the deposit be returned?",
  options: [
    { title: "Yes", description: "" },
    { title: "No", description: "" },
  ],
  aliases: {},
  primaryDocument: null,
};

const HINT = "Your wallet will first ask you to sign in, to upload the dispute data, and then to confirm the transaction.";

const SIGN_IN_REJECTED: UploadResult = { ok: false, error: "sign-in-rejected", message: "Signature declined. Nothing was uploaded." };

interface RenderSummaryOptions {
  readonly wallet?: TestWallet;
  readonly connect?: boolean;
}

async function renderSummary(uploader: FakeUploader, options: RenderSummaryOptions = {}) {
  const wallet = options.wallet ?? createTestWallet({ chainId: 1 });
  const user = userEvent.setup();
  renderWithProviders(<CreateSummary chain={CHAIN} input={INPUT} onReturn={vi.fn()} />, { path: "/1", wallet, uploader });
  if (options.connect ?? true) {
    await act(async () => {
      await wallet.connect();
    });
  }
  return { user };
}

/** A write that waits in the wallet forever, so the summary stays on the awaiting-confirmation step. */
function walletAwaitingController(): FakeWriteController {
  function useAwaitingWrite(): WriteController {
    const [status, setStatus] = useState<WriteStatus>({ phase: "idle" });
    const execute = useCallback(() => {
      setStatus({ phase: "pending" });
      return new Promise<WriteOutcome>(() => undefined);
    }, []);
    const reset = useCallback(() => {
      setStatus({ phase: "idle" });
    }, []);
    return useMemo(() => ({ status, execute, reset }), [status, execute, reset]);
  }
  return { ...fakeWriteController([]), useWrite: useAwaitingWrite };
}

function createButton(): HTMLElement {
  return screen.getByRole("button", { name: "Create dispute" });
}

beforeEach(() => {
  installOfflineAppKitEnvironment();
  vi.mocked(core.listCourts).mockResolvedValue({ ok: true, value: [testCourt({ id: 0n, name: "General Court" })] });
  vi.mocked(core.readArbitrationCost).mockResolvedValue({ ok: true, value: 10n ** 16n });
  writes.controller = fakeWriteController([]);
});

afterEach(() => {
  writes.controller = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("CreateSummary", () => {
  it("says near Create, centred over the actions from lg, that creating asks for a sign-in first and then for the transaction, while not signed in", async () => {
    await renderSummary(fakeUploader({ isSignedIn: false }));

    expect(screen.getByText(HINT)).toHaveClass("lg:text-center");
    expect(createButton()).toBeEnabled();
    expect(createButton()).toHaveAccessibleDescription(HINT);
  });

  it("shows no sign-in sentence once signed in", async () => {
    await renderSummary(fakeUploader());

    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(createButton()).not.toHaveAccessibleDescription(HINT);
  });

  it("hides the sign-in sentence while Create publishes the dispute data", async () => {
    const uploader = fakeUploader({ isSignedIn: false, uploadJson: () => new Promise<UploadResult>(() => undefined) });
    const { user } = await renderSummary(uploader);

    await user.click(createButton());

    expect(await screen.findByText("Publishing the dispute data")).toBeInTheDocument();
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("shows no sign-in sentence without a wallet, since Create cannot ask for any signature", async () => {
    await renderSummary(fakeUploader({ isSignedIn: false }), { connect: false });

    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).not.toHaveAccessibleDescription(HINT);
  });

  it("shows no sign-in sentence while the wallet is on another chain than the page, since Create cannot ask for any signature", async () => {
    const wallet = holdChainSwitches(createTestWallet({ chainId: 100 }));
    await renderSummary(fakeUploader({ isSignedIn: false }), { wallet });

    expect(screen.getByText("Wrong network")).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(createButton()).not.toHaveAccessibleDescription(HINT);
  });

  it("shows no sign-in sentence without an upload service", async () => {
    await renderSummary(fakeUploader({ availability: "unconfigured", isSignedIn: false }));

    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("brings the sign-in sentence back after a declined sign-in", async () => {
    const uploader = fakeUploader({ isSignedIn: false, uploadJson: () => Promise.resolve(SIGN_IN_REJECTED) });
    const { user } = await renderSummary(uploader);

    await user.click(createButton());

    expect(await screen.findByText("Signature declined. Nothing was uploaded. Nothing was sent.")).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(createButton()).toHaveAccessibleDescription(HINT);
  });

  it("names the Create button as creating the dispute while the dispute data is published", async () => {
    const uploader = fakeUploader({ uploadJson: () => new Promise<UploadResult>(() => undefined) });
    const { user } = await renderSummary(uploader);

    await user.click(createButton());

    expect(await screen.findByText("Publishing the dispute data")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Creating the dispute" });
    expect(button).toHaveTextContent("Create dispute");
  });

  it("names the Create button as creating the dispute while the wallet asks to confirm the transaction", async () => {
    writes.controller = walletAwaitingController();
    const { user } = await renderSummary(fakeUploader());

    await user.click(createButton());

    expect(await screen.findByText("Waiting for your wallet")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Creating the dispute" });
    expect(button).toHaveTextContent("Create dispute");
  });
  describe("the primary button", () => {
    it("without a wallet the primary button reads Connect and opens the wallet modal on the page chain", async () => {
      const wallet = createTestWallet({ chainId: 1 });
      const uploader = fakeUploader();
      const { user } = await renderSummary(uploader, { wallet, connect: false });

      const primary = screen.getByRole("button", { name: "Connect" });
      expect(primary).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Create dispute" })).toBeNull();
      expect(screen.queryByText("Wallet required")).toBeNull();
      await user.click(primary);

      expect(wallet.modal?.openConnect).toHaveBeenCalledWith(1);
      expect(uploader.uploadJson).not.toHaveBeenCalled();
    });

    it("while the wallet connects the primary button reads Connecting and takes no press", async () => {
      const wallet = createTestWallet({ chainId: 1, pendingReconnect: true });
      const { user } = await renderSummary(fakeUploader(), { wallet, connect: false });

      const primary = screen.getByRole("button", { name: "Connecting" });
      expect(primary).toBeDisabled();
      await user.click(primary);

      expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
    });

    it("once a wallet is connected on the page chain the same button reads Create dispute", async () => {
      const wallet = createTestWallet({ chainId: 1 });
      await renderSummary(fakeUploader(), { wallet, connect: false });
      const primary = screen.getByRole("button", { name: "Connect" });

      await act(async () => {
        await wallet.connect();
      });

      expect(createButton()).toBe(primary);
      expect(primary).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    });

    it("without any connector the primary button is a disabled Connect with no text about why", async () => {
      const wallet = createTestWallet({ chainId: 1, mode: "unconfigured" });
      const { user } = await renderSummary(fakeUploader(), { wallet, connect: false });

      const primary = screen.getByRole("button", { name: "Connect" });
      expect(primary).toBeDisabled();
      expect(primary).not.toHaveAccessibleDescription();
      await user.click(primary);
      expect(document.body).not.toHaveTextContent(/configured|deployment|unavailable|Connect a wallet/i);
    });

    it("without an upload service the primary button is a disabled Create dispute whatever the wallet state", async () => {
      const disconnected = await renderSummary(fakeUploader({ availability: "unconfigured" }), { connect: false });
      expect(createButton()).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
      await disconnected.user.click(createButton());
      expect(document.body).not.toHaveTextContent(/uploads? (are )?unavailable/i);
      cleanup();

      await renderSummary(fakeUploader({ availability: "unconfigured" }));
      expect(createButton()).toBeDisabled();
      cleanup();

      await renderSummary(fakeUploader({ availability: "unconfigured" }), { wallet: createTestWallet({ chainId: 1, pendingReconnect: true }), connect: false });
      expect(createButton()).toBeDisabled();
    });

    it("on another chain the primary button is a disabled Create dispute and the notice still offers the switch", async () => {
      const wallet = holdChainSwitches(createTestWallet({ chainId: 100 }));
      await renderSummary(fakeUploader(), { wallet });

      expect(createButton()).toBeDisabled();
      expect(screen.getByText("Wrong network")).toBeInTheDocument();
      expect(screen.getByText(/^A switch to .+ is waiting in your wallet\.$/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    });
  });
});
