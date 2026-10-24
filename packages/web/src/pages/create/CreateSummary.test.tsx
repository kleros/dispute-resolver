import * as core from "@dispute-resolver/core";
import { act, screen } from "@testing-library/react";
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
  return screen.getByRole("button", { name: "Create" });
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
  it("says near Create that creating asks for a sign-in first and then for the transaction, while not signed in", async () => {
    await renderSummary(fakeUploader({ isSignedIn: false }));

    expect(screen.getByText(HINT)).toBeInTheDocument();
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

    expect(screen.getByText("Connect a wallet to create a dispute.")).toBeInTheDocument();
    expect(createButton()).toBeDisabled();
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(createButton()).not.toHaveAccessibleDescription(HINT);
  });

  it("shows no sign-in sentence while the wallet is on another chain than the page, since Create cannot ask for any signature", async () => {
    const wallet = createTestWallet({ chainId: 100 });
    holdChainSwitches(wallet);
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
    expect(button).toHaveTextContent("Create");
  });

  it("names the Create button as creating the dispute while the wallet asks to confirm the transaction", async () => {
    writes.controller = walletAwaitingController();
    const { user } = await renderSummary(fakeUploader());

    await user.click(createButton());

    expect(await screen.findByText("Waiting for your wallet")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Creating the dispute" });
    expect(button).toHaveTextContent("Create");
  });
});
