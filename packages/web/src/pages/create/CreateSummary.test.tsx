import * as core from "@dispute-resolver/core";
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadResult } from "../../atlas";
import { fakeUploader, type FakeUploader } from "../../test/atlas";
import { testChain, testCourt } from "../../test/data";
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

const CHAIN = testChain(1);

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

  it.each([
    ["once signed in", () => renderSummary(fakeUploader()), "Create dispute"],
    ["without a wallet, since Create cannot ask for any signature", () => renderSummary(fakeUploader({ isSignedIn: false }), { connect: false }), "Connect"],
    [
      "while the wallet is on another chain than the page, since Create cannot ask for any signature",
      () => renderSummary(fakeUploader({ isSignedIn: false }), { wallet: holdChainSwitches(createTestWallet({ chainId: 100 })) }),
      "Create dispute",
    ],
    ["without an upload service", () => renderSummary(fakeUploader({ availability: "unconfigured", isSignedIn: false })), "Create dispute"],
  ])("shows no sign-in sentence %s", async (_condition, render, primary) => {
    await render();

    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: primary })).not.toHaveAccessibleDescription(HINT);
  });

  it("hides the sign-in sentence while Create publishes the dispute data", async () => {
    const uploader = fakeUploader({ isSignedIn: false, uploadJson: () => new Promise<UploadResult>(() => undefined) });
    const { user } = await renderSummary(uploader);

    await user.click(createButton());

    expect(await screen.findByText("Publishing the dispute data")).toBeInTheDocument();
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

  it.each([
    ["the dispute data is published", "Publishing the dispute data", { uploadJson: () => new Promise<UploadResult>(() => undefined) }, () => fakeWriteController([])],
    ["the wallet asks to confirm the transaction", "Waiting for your wallet", {}, walletAwaitingController],
  ])("names the Create button as creating the dispute while %s", async (_phase, shown, uploaderOptions, writeController) => {
    writes.controller = writeController();
    const { user } = await renderSummary(fakeUploader(uploaderOptions));

    await user.click(createButton());

    expect(await screen.findByText(shown)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Creating the dispute" })).toHaveTextContent("Create dispute");
  });

  describe("the primary button", () => {
    it("while the wallet connects the primary button reads Connecting and takes no press", async () => {
      const wallet = createTestWallet({ chainId: 1, pendingReconnect: true });
      const { user } = await renderSummary(fakeUploader(), { wallet, connect: false });

      const primary = screen.getByRole("button", { name: "Connecting" });
      expect(primary).toBeDisabled();
      await user.click(primary);

      expect(wallet.modal?.openConnect).not.toHaveBeenCalled();
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
  });
});
