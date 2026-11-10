import * as core from "@dispute-resolver/core";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AtlasUploaderProvider, type AtlasUploader, type UploadPhase, type UploadResult } from "../../atlas";
import { fakeUploader, TEST_UPLOAD_PATH, type FakeUploader } from "../../test/atlas";
import { testChain, testCourt } from "../../test/data";
import { renderWithProviders } from "../../test/shell";
import { createTestWallet, fakeWriteController, holdChainSwitches, installOfflineAppKitEnvironment, type FakeWriteController, type TestWallet } from "../../test/wallet";
import { useWriteObserver, type WriteController, type WriteOptions, type WriteOutcome, type WriteStatus } from "../../wallet";
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

/** A write that waits in the wallet forever, so the summary stays on the awaiting-confirmation step; it reports as the real hook does. */
function walletAwaitingController(): FakeWriteController {
  function useAwaitingWrite(): WriteController {
    const observe = useWriteObserver();
    const source = useId();
    const [status, setStatus] = useState<WriteStatus>({ phase: "idle" });
    const execute = useCallback(
      (_build: unknown, options: WriteOptions) => {
        setStatus({ phase: "pending" });
        observe(source).report({ phase: "pending" }, options.wording);
        return new Promise<WriteOutcome>(() => undefined);
      },
      [observe, source],
    );
    const reset = useCallback(() => {
      setStatus({ phase: "idle" });
    }, []);
    return useMemo(() => ({ status, execute, reset }), [status, execute, reset]);
  }
  return { ...fakeWriteController([]), useWrite: useAwaitingWrite };
}

interface PhaseStore {
  readonly get: () => UploadPhase;
  readonly set: (phase: UploadPhase) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

function phaseStore(): PhaseStore {
  let phase: UploadPhase = "idle";
  const listeners = new Set<() => void>();
  return {
    get: () => phase,
    set: (next) => {
      phase = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The real uploader moves through its phases during one upload; the fake one is static, so this one reads them from a store. */
function PhasedUploader({ uploader, phases, children }: { readonly uploader: AtlasUploader; readonly phases: PhaseStore; readonly children: ReactNode }) {
  const phase = useSyncExternalStore(phases.subscribe, phases.get);
  const value = useMemo(() => ({ ...uploader, phase }), [uploader, phase]);
  return <AtlasUploaderProvider uploader={value}>{children}</AtlasUploaderProvider>;
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
  vi.useRealTimers();
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
    const uploader = fakeUploader({ isSignedIn: false, phase: "signing-in", uploadJson: () => new Promise<UploadResult>(() => undefined) });
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
    [
      "the dispute data is published",
      "Publishing the dispute data",
      { phase: "signing-in" as const, uploadJson: () => new Promise<UploadResult>(() => undefined) },
      () => fakeWriteController([]),
    ],
    ["the wallet asks to confirm the transaction", "Waiting for your wallet", {}, walletAwaitingController],
  ])("names the Create button as creating the dispute while %s", async (_phase, shown, uploaderOptions, writeController) => {
    writes.controller = writeController();
    const { user } = await renderSummary(fakeUploader(uploaderOptions));

    await user.click(createButton());

    expect(await screen.findByText(shown)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Creating the dispute" })).toHaveTextContent("Create dispute");
  });

  it("a wallet on another chain says in place why Create is locked, with the waiting switch, and no toast", async () => {
    await renderSummary(fakeUploader(), { wallet: holdChainSwitches(createTestWallet({ chainId: 100 })) });

    expect(await screen.findByText("Wrong network")).toBeInTheDocument();
    expect(screen.getByText("Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet.")).toBeInTheDocument();
    expect(screen.getByText("A switch to Ethereum Mainnet is waiting in your wallet.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Nothing was sent");
    expect(createButton()).toBeDisabled();
    expect(within(screen.getByRole("region", { name: "Notifications" })).queryByText("Wrong network")).toBeNull();
  });

  describe("the publishing notice", () => {
    const PUBLISHING = "Publishing the dispute data";
    const UPLOADING = "Uploading the dispute data to IPFS...";
    const SIGN_IN = "Sign the message in your wallet to upload the dispute data to IPFS.";
    const UPLOADED: UploadResult = { ok: true, path: TEST_UPLOAD_PATH };
    const UPLOAD_FAILED: UploadResult = { ok: false, error: "upload-failed", message: "Atlas did not answer." };

    function settlesAfter(ms: number, result: UploadResult): Promise<UploadResult> {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(result);
        }, ms);
      });
    }

    function neverSettles(): Promise<UploadResult> {
      return new Promise<UploadResult>(() => undefined);
    }

    /** Renders on real timers, connects, then fakes the timers so each test sets the clock from the press on. */
    async function renderPublishing(uploadJson: AtlasUploader["uploadJson"], phases: PhaseStore = phaseStore()) {
      writes.controller = walletAwaitingController();
      const uploader = fakeUploader({ uploadJson });
      const wallet = createTestWallet({ chainId: 1 });
      renderWithProviders(
        <PhasedUploader uploader={uploader} phases={phases}>
          <CreateSummary chain={CHAIN} input={INPUT} onReturn={vi.fn()} />
        </PhasedUploader>,
        { path: "/1", wallet, uploader },
      );
      await act(async () => {
        await wallet.connect();
      });
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    }

    /** user-event and Testing Library's async wrapper wait on setTimeout, which the faked clock never fires on its own. */
    async function pressCreate() {
      await act(async () => {
        fireEvent.click(createButton());
        await Promise.resolve();
      });
    }

    async function advance(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    /** The space between the summary and the buttons, where the step notices appear. */
    function noticeArea(): Element {
      const area = screen.getByRole("region", { name: INPUT.title }).querySelector('[aria-live="polite"]');
      if (area === null) throw new Error("The summary has no notice area.");
      return area;
    }

    it("a publish that ends within half a second never shows the notice and leaves the space above the buttons empty", async () => {
      await renderPublishing(() => settlesAfter(300, UPLOADED));

      await pressCreate();
      expect(noticeArea()).toBeEmptyDOMElement();
      await advance(300);
      expect(noticeArea()).toBeEmptyDOMElement();
      await advance(1000);

      expect(screen.getByText("Waiting for your wallet")).toBeInTheDocument();
      expect(screen.queryByText(PUBLISHING)).toBeNull();
      expect(noticeArea()).toBeEmptyDOMElement();
    });

    it("a publish that lasts longer shows that the dispute data is uploading from half a second on", async () => {
      await renderPublishing(neverSettles);

      await pressCreate();
      await advance(499);
      expect(screen.queryByText(PUBLISHING)).toBeNull();
      expect(noticeArea()).toBeEmptyDOMElement();
      await advance(1);

      expect(screen.getByText(PUBLISHING)).toBeInTheDocument();
      expect(screen.getByText(UPLOADING)).toBeInTheDocument();
    });

    it("a sign-in shows the notice asking for the signature at once", async () => {
      const phases = phaseStore();
      await renderPublishing(() => {
        phases.set("signing-in");
        return neverSettles();
      }, phases);

      await pressCreate();

      expect(screen.getByText(PUBLISHING)).toBeInTheDocument();
      expect(screen.getByText(SIGN_IN)).toBeInTheDocument();
    });

    it("a sign-in that starts after the press shows the notice as soon as the signature is asked for", async () => {
      const phases = phaseStore();
      await renderPublishing(neverSettles, phases);

      await pressCreate();
      await advance(100);
      expect(noticeArea()).toBeEmptyDOMElement();
      act(() => {
        phases.set("signing-in");
      });

      expect(screen.getByText(PUBLISHING)).toBeInTheDocument();
      expect(screen.getByText(SIGN_IN)).toBeInTheDocument();
      act(() => {
        phases.set("uploading");
      });
      expect(screen.getByText(UPLOADING)).toBeInTheDocument();
    });

    it("a sign-in followed by the upload keeps the notice, which then says the dispute data is uploading", async () => {
      const phases = phaseStore();
      await renderPublishing(() => {
        phases.set("signing-in");
        return neverSettles();
      }, phases);

      await pressCreate();
      await advance(100);
      act(() => {
        phases.set("uploading");
      });

      expect(screen.getByText(PUBLISHING)).toBeInTheDocument();
      expect(screen.getByText(UPLOADING)).toBeInTheDocument();
      await advance(1000);
      expect(screen.getByText(UPLOADING)).toBeInTheDocument();
    });

    it("leaving the publishing step removes its notice", async () => {
      await renderPublishing(() => settlesAfter(800, UPLOADED));

      await pressCreate();
      await advance(500);
      expect(screen.getByText(PUBLISHING)).toBeInTheDocument();
      await advance(300);

      expect(screen.getByText("Waiting for your wallet")).toBeInTheDocument();
      expect(screen.queryByText(PUBLISHING)).toBeNull();
      expect(noticeArea()).toBeEmptyDOMElement();
    });

    it("a second press waits half a second again before showing the notice", async () => {
      let presses = 0;
      await renderPublishing(() => {
        presses += 1;
        return presses === 1 ? settlesAfter(400, UPLOAD_FAILED) : neverSettles();
      });

      await pressCreate();
      await advance(400);
      expect(screen.getByText("Atlas did not answer. Nothing was sent.")).toBeInTheDocument();

      await pressCreate();
      await advance(499);
      expect(screen.queryByText(PUBLISHING)).toBeNull();
      expect(noticeArea()).toBeEmptyDOMElement();
      await advance(1);

      expect(screen.getByText(UPLOADING)).toBeInTheDocument();
    });
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
