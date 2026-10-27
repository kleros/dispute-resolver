import * as core from "@dispute-resolver/core";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { numberToHex, toEventSelector } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadResult } from "../../atlas";
import type { CoreDeps } from "../../data";
import type { WriteStatus } from "../../wallet";
import { formatAmount } from "../../ui";
import { ToastProvider } from "../../shell";
import { TEST_UPLOAD_CID, TEST_UPLOAD_PATH, atlasWrapper, fakeUploader, installFakeAtlasServer, type FakeAtlasServer, type FakeUploader } from "../../test/atlas";
import { createTestDeps, testCourt } from "../../test/data";
import { renderAtPath } from "../../test/routing";
import { matchOnly } from "../../test/matchMedia";
import { renderWithProviders } from "../../test/shell";
import {
  TEST_TX_HASH,
  createTestWallet,
  fakeWriteController,
  holdChainSwitches,
  installOfflineAppKitEnvironment,
  testReceipt,
  type FakeWriteController,
  type TestWallet,
} from "../../test/wallet";
import { CreatePage } from "./index";

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

const SEPOLIA = 11155111;
const SEPOLIA_CHAIN = core.getChain(SEPOLIA);
if (SEPOLIA_CHAIN?.klerosLiquid === undefined || SEPOLIA_CHAIN.arbitrableProxy === undefined) throw new Error("Sepolia must be able to create disputes.");
const ARBITRATOR = SEPOLIA_CHAIN.klerosLiquid;
const PROXY = SEPOLIA_CHAIN.arbitrableProxy;
const CREATE_PATH = `/${String(SEPOLIA)}/create`;
/** A configured chain that can also create disputes, for the chain-change tests. */
const GNOSIS = 100;
const GNOSIS_CHAIN = core.getChain(GNOSIS);
if (GNOSIS_CHAIN === undefined) throw new Error("Gnosis must be configured.");

/** The fake cost depends on the court and the votes, so a test can tell which pair was read. */
function costOf(extraData: core.Hex): bigint {
  const court = BigInt(`0x${extraData.slice(2, 66)}`);
  const votes = BigInt(`0x${extraData.slice(66)}`);
  return (court + 1n) * votes * 10n ** 15n;
}

const COURTS = [testCourt({ id: 0n, name: "General Court" }), testCourt({ id: 1n, name: "Blockchain" }), testCourt({ id: 2n, name: null })];

function minedWith(disputeId: bigint | null): WriteStatus[] {
  const logs =
    disputeId === null
      ? []
      : [{ address: ARBITRATOR, topics: [toEventSelector("DisputeCreation(uint256,address)"), numberToHex(disputeId, { size: 32 }), numberToHex(BigInt(PROXY), { size: 32 })] }];
  return [
    { phase: "pending" },
    { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null },
    { phase: "mined", hash: TEST_TX_HASH, explorerUrl: null, receipt: { ...testReceipt(), logs } },
  ];
}

interface Rendered {
  readonly user: UserEvent;
  readonly uploader: FakeUploader;
  readonly wallet: TestWallet;
  readonly currentPath: () => string;
  readonly unmount: () => void;
}

interface RenderCreateOptions {
  readonly path?: string;
  readonly uploader?: FakeUploader;
  readonly wallet?: TestWallet;
  readonly connect?: boolean;
  readonly deps?: CoreDeps;
}

async function renderCreate(options: RenderCreateOptions = {}): Promise<Rendered> {
  const uploader = options.uploader ?? fakeUploader();
  const wallet = options.wallet ?? createTestWallet({ chainId: SEPOLIA });
  const user = userEvent.setup();
  const result = renderWithProviders(<CreatePage />, { path: options.path ?? CREATE_PATH, wallet, uploader, deps: options.deps });
  if (options.connect ?? true) {
    await act(async () => {
      await wallet.connect();
    });
  }
  return { user, uploader, wallet, currentPath: result.currentPath, unmount: result.unmount };
}

/** The page over the real `AtlasGate` and `@kleros/kleros-app` provider, with Atlas and the wallet's signing RPC faked. */
async function renderWithRealAtlas(wallet: TestWallet): Promise<{ readonly user: UserEvent; readonly server: FakeAtlasServer }> {
  const server = installFakeAtlasServer();
  const AtlasProviders = atlasWrapper(wallet);
  function Providers({ children }: { readonly children?: ReactNode }) {
    return (
      <AtlasProviders>
        <ToastProvider>{children}</ToastProvider>
      </AtlasProviders>
    );
  }
  const user = userEvent.setup();
  renderAtPath(<CreatePage />, CREATE_PATH, { wrapper: Providers });
  await act(async () => {
    await wallet.connect();
  });
  await waitFor(() => {
    expect(server.count("roles")).toBe(1);
  });
  return { user, server };
}

/**
 * The Primary Document field's file input. The library's drop zone hides it from the accessibility tree and offers a button
 * named "Primary Document (Optional)" instead, so the input is reached through its group, the "Primary document" fieldset.
 */
function documentInput(): HTMLInputElement {
  const input = screen.getByRole("group", { name: /^Primary document/ }).querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("no file input");
  return input;
}

/** A library dropdown's button: its accessible name is the selected value followed by the field's label. */
function select(label: string): HTMLElement {
  return screen.getByRole("button", { name: (name) => name.endsWith(` ${label}`) });
}

async function chooseOption(user: UserEvent, label: string, option: string) {
  await user.click(select(label));
  await user.click(await screen.findByRole("option", { name: option }));
}

/** The names of a dropdown's options, read by opening it and closed again with Escape. */
async function optionsOf(user: UserEvent, label: string): Promise<string[]> {
  await user.click(select(label));
  const names = (await screen.findAllByRole("option")).map((option) => option.textContent);
  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(screen.queryByRole("option")).toBeNull();
  });
  return names;
}

async function courtsLoaded() {
  await waitFor(() => {
    expect(select("Court")).toHaveTextContent("General Court");
  });
}

/** The Arbitration Cost output: `wei` shown with the chain's currency, its exact amount in the `data` element's value. */
async function costShown(wei: bigint, chain: core.ChainConfig) {
  await waitFor(() => {
    expect(within(screen.getByRole("status", { name: "Arbitration Cost" })).getByText(formatAmount(wei, chain))).toHaveAttribute("value", wei.toString());
  });
}

async function typeInto(user: UserEvent, label: string | RegExp, text: string) {
  const input = screen.getByRole("textbox", { name: label });
  await user.clear(input);
  if (text !== "") await user.type(input, text);
}

async function setNumber(user: UserEvent, label: string, value: string) {
  const input = screen.getByRole("textbox", { name: label });
  await user.clear(input);
  await user.type(input, value);
  await user.tab();
}

async function fillRequired(user: UserEvent) {
  await typeInto(user, "Title", "Who keeps the deposit?");
  await typeInto(user, "Question", "Which party is right?");
}

async function fillOptions(user: UserEvent, titles: readonly string[]) {
  for (const [index, title] of titles.entries()) await typeInto(user, `Ruling Option ${String(index + 1)}`, title);
}

async function toSummary(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("button", { name: "Return" });
}

/** Fills the required fields with a Yes / No question and continues to the summary. */
async function fillToSummary(user: UserEvent) {
  await fillRequired(user);
  await fillOptions(user, ["Yes", "No"]);
  await toSummary(user);
}

/** The value the summary shows for `term`: the `dd` that follows the `dt` reading `term`. */
function summaryValue(term: string): HTMLElement {
  const value = [...document.querySelectorAll("dt")].find((element) => element.textContent === term)?.nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`no summary row ${term}`);
  return value;
}

function uploadedMetaEvidence(uploader: FakeUploader): core.CreatedMetaEvidence {
  const call = uploader.uploadJson.mock.calls[0];
  if (call === undefined) throw new Error("no meta-evidence upload");
  return call[1] as core.CreatedMetaEvidence;
}

function createCall(controller: FakeWriteController): core.WriteCall {
  const build = controller.executions[0]?.builds[0];
  if (build?.ok !== true) throw new Error("no create-dispute build");
  return build.call;
}

/** Changing step scrolls the steps into view; jsdom lays nothing out and has no scrollIntoView. */
const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>();

beforeEach(() => {
  window.localStorage.clear();
  Element.prototype.scrollIntoView = scrollIntoView;
  // jsdom has no ResizeObserver, which the library's Steps and popovers use; this double stubs it with the rest of the browser surface.
  installOfflineAppKitEnvironment();
  vi.mocked(core.listCourts).mockResolvedValue({ ok: true, value: COURTS });
  vi.mocked(core.readArbitrationCost).mockImplementation((_client, _chain, extraData) => Promise.resolve({ ok: true, value: costOf(extraData) }));
  writes.controller = fakeWriteController(minedWith(42n));
});

afterEach(() => {
  window.localStorage.clear();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  scrollIntoView.mockReset();
  writes.controller = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("CreatePage", () => {
  it("a chain without an ArbitrableProxy shows the precondition message and its GitHub issues link", async () => {
    await renderCreate({ path: "/137/create", connect: false });
    expect(screen.getByRole("heading", { name: /no arbitrable contract deployed/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Create dispute steps" })).toBeNull();
    expect(screen.getByRole("link", { name: /GitHub issues/ })).toHaveAttribute("href", "https://github.com/kleros/dispute-resolver/issues");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("a chain that can create shows the form with its courts, the default cost in its currency and the question types", async () => {
    const { user } = await renderCreate({ connect: false });
    expect(screen.getByRole("navigation", { name: "Create dispute steps" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    await courtsLoaded();
    expect(await optionsOf(user, "Court")).toEqual(["General Court", "Blockchain", "Court #2 (name unavailable)"]);
    await costShown(costOf(core.encodeExtraData(0n, 3n)), SEPOLIA_CHAIN);
    expect(screen.getByRole("status", { name: "Arbitration Cost" })).toHaveTextContent(/ sETH$/);
    expect(await optionsOf(user, "Question Type")).toEqual(["Multiple choice: single select", "Multiple choice: multiple select", "Non-negative number", "Date"]);
  });

  it("the number of options stays between 2 and 32", async () => {
    const { user } = await renderCreate({ connect: false });
    const count = screen.getByRole("textbox", { name: "Number of Options" });
    expect(count).toHaveValue("2");
    expect(screen.getByRole("button", { name: "Decrease Number of Options" })).toBeDisabled();
    await setNumber(user, "Number of Options", "1");
    expect(count).toHaveValue("2");
    await setNumber(user, "Number of Options", "40");
    expect(count).toHaveValue("32");
    expect(screen.getByRole("button", { name: "Increase Number of Options" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Ruling Option 32" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Ruling Option 33" })).toBeNull();
  });

  it("the required fields are marked required and the optional ones are not", async () => {
    const { user } = await renderCreate({ connect: false });
    await user.click(screen.getByRole("button", { name: "Add party" }));
    for (const required of ["Number of Votes", "Title", "Number of Options", "Question", "Ruling Option 1", "Ruling Option 2"]) {
      expect(screen.getByRole("textbox", { name: required }), required).toHaveAttribute("aria-required", "true");
    }
    for (const optional of [
      "Category (Optional)",
      "Description (Optional)",
      "Ruling Option 1 Description (Optional)",
      "Ruling Option 2 Description (Optional)",
      "Alias 1 (Optional)",
      "Address 1 (Optional)",
      "Alias 2 (Optional)",
      "Address 2 (Optional)",
    ]) {
      expect(screen.getByRole("textbox", { name: optional }), optional).not.toHaveAttribute("aria-required");
    }
    expect(documentInput()).not.toBeRequired();
  });

  it("a failed court list degrades the court field with its reason and a retry", async () => {
    vi.mocked(core.listCourts).mockResolvedValueOnce({ ok: false, error: { code: "rpc-error", message: "The courts could not be read." } });
    const { user } = await renderCreate({ connect: false });
    expect(await screen.findByText("The courts could not be read.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await courtsLoaded();
    expect(select("Court")).toBeEnabled();
    expect(screen.queryByText("The courts could not be read.")).toBeNull();
  });

  it("input typed while the courts load is kept once they arrive", async () => {
    let resolveCourts: ((value: core.Outcome<readonly core.Court[]>) => void) | undefined;
    const pending = new Promise<core.Outcome<readonly core.Court[]>>((resolve) => {
      resolveCourts = resolve;
    });
    vi.mocked(core.listCourts).mockReturnValueOnce(pending);
    const { user } = await renderCreate({ connect: false });
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await typeInto(user, "Title", "Typed early");
    await act(async () => {
      resolveCourts?.({ ok: true, value: COURTS });
      await Promise.resolve();
    });
    await courtsLoaded();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Typed early");
  });

  it("Continue reports every invalid field and moves on only once the form is valid", async () => {
    const { user } = await renderCreate({ connect: false });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Some fields need attention")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Ruling Option 1" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    expect(screen.queryByText("Some fields need attention")).toBeNull();
    await toSummary(user);
  });

  it("changing the number of options trims the rows and what is submitted", async () => {
    const { user, uploader } = await renderCreate();
    await fillRequired(user);
    await setNumber(user, "Number of Options", "3");
    await fillOptions(user, ["A", "B", "C"]);
    await setNumber(user, "Number of Options", "2");
    expect(screen.queryByRole("textbox", { name: "Ruling Option 3" })).toBeNull();
    await toSummary(user);
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    await screen.findByText("Dispute 42 created");
    expect(uploadedMetaEvidence(uploader).rulingOptions.titles).toEqual(["A", "B"]);
  });

  it("the steps follow the form and the summary, and the page logs no DOM-attribute warning beyond the library's known one", async () => {
    const consoleError = vi.spyOn(console, "error");
    const { user } = await renderCreate({ connect: false });
    await courtsLoaded();
    expect(screen.getByRole("listitem", { name: "Form" })).toHaveAttribute("aria-current", "step");
    await fillToSummary(user);
    expect(screen.getByRole("listitem", { name: "Summary" })).toHaveAttribute("aria-current", "step");
    const attributeWarnings = consoleError.mock.calls.filter((call) => call.map(String).join(" ").includes("non-boolean attribute"));
    // The library's horizontal Steps forwards its `active` prop to a div; React warns in development and writes nothing.
    expect(attributeWarnings.filter((call) => !call.includes("active"))).toEqual([]);
  });

  it("Return keeps every value, the chosen court and its cost", async () => {
    const { user } = await renderCreate({ connect: false });
    await courtsLoaded();
    await chooseOption(user, "Court", "Blockchain");
    await setNumber(user, "Number of Votes", "5");
    await fillToSummary(user);
    expect(screen.getByText("Blockchain")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return" }));
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Who keeps the deposit?");
    expect(screen.getByRole("textbox", { name: "Ruling Option 2" })).toHaveValue("No");
    expect(screen.getByRole("textbox", { name: "Number of Votes" })).toHaveValue("5");
    expect(select("Court")).toHaveTextContent("Blockchain");
    await costShown(costOf(core.encodeExtraData(1n, 5n)), SEPOLIA_CHAIN);
  });

  describe("draft kept across reloads", () => {
    const DRAFT_KEY = `dr-create-draft:${String(SEPOLIA)}`;

    it("typed values survive a remount of the page", async () => {
      const first = await renderCreate();
      await courtsLoaded();
      await setNumber(first.user, "Number of Votes", "5");
      await typeInto(first.user, "Description (Optional)", "Deposit of the flat");
      await fillRequired(first.user);
      await fillOptions(first.user, ["Yes", "No"]);
      await first.user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));
      await screen.findByText("Uploaded rules.pdf.");
      first.unmount();

      await renderCreate();
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Who keeps the deposit?");
      expect(screen.getByRole("textbox", { name: "Description (Optional)" })).toHaveValue("Deposit of the flat");
      expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("Which party is right?");
      expect(screen.getByRole("textbox", { name: "Ruling Option 2" })).toHaveValue("No");
      expect(screen.getByRole("textbox", { name: "Number of Votes" })).toHaveValue("5");
      expect(screen.getByText("Uploaded rules.pdf.")).toBeInTheDocument();
      expect(screen.queryByText("Some fields need attention")).toBeNull();
      expect(window.localStorage.getItem(DRAFT_KEY)).not.toContain("%PDF");
    });

    it("a reload on the summary step returns to the form with its values", async () => {
      const first = await renderCreate();
      await fillToSummary(first.user);
      first.unmount();

      await renderCreate();
      expect(screen.getByRole("listitem", { name: "Form" })).toHaveAttribute("aria-current", "step");
      expect(screen.queryByRole("button", { name: "Return" })).toBeNull();
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Who keeps the deposit?");
      expect(screen.getByRole("textbox", { name: "Ruling Option 1" })).toHaveValue("Yes");
    });

    it("the stored draft is cleared once the dispute is created", async () => {
      const { user } = await renderCreate();
      await fillToSummary(user);
      expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();
      await user.click(screen.getByRole("button", { name: "Create dispute" }));
      expect(await screen.findByText("You have successfully created dispute 42!")).toBeInTheDocument();
      expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it("Clear form empties every field, forgets the stored draft and is disabled while the form is empty", async () => {
      const { user } = await renderCreate();
      await courtsLoaded();
      const clear = screen.getByRole("button", { name: "Clear form" });
      expect(clear).toBeDisabled();
      await chooseOption(user, "Court", "Blockchain");
      await setNumber(user, "Number of Votes", "5");
      await typeInto(user, "Title", "Who keeps the deposit?");
      await typeInto(user, "Description (Optional)", "Deposit of the flat");
      await typeInto(user, "Ruling Option 1", "Yes");
      await typeInto(user, "Alias 1 (Optional)", "Alice");
      await user.click(screen.getByRole("button", { name: "Add party" }));
      await user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));
      await screen.findByText("Uploaded rules.pdf.");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(screen.getByText("Some fields need attention")).toBeInTheDocument();
      expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull();
      expect(clear).toBeEnabled();

      await user.click(clear);
      expect(select("Court")).toHaveTextContent("General Court");
      expect(screen.getByRole("textbox", { name: "Number of Votes" })).toHaveValue("3");
      for (const label of ["Title", "Description (Optional)", "Question", "Ruling Option 1", "Ruling Option 2", "Alias 1 (Optional)", "Address 1 (Optional)"]) {
        expect(screen.getByRole("textbox", { name: label })).toHaveValue("");
      }
      expect(screen.queryByRole("textbox", { name: "Alias 2 (Optional)" })).toBeNull();
      expect(screen.queryByText("Uploaded rules.pdf.")).toBeNull();
      expect(screen.getByText(/^Drop a file here or click to select one\./)).toBeInTheDocument();
      expect(screen.queryByText("Some fields need attention")).toBeNull();
      expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
      expect(clear).toBeDisabled();
      expect(screen.getByRole("heading", { name: "Create a custom dispute" })).toHaveFocus();
    });

    it("an upload that finishes after Clear form does not bring its document back into the empty form", async () => {
      const upload: { finish?: (result: UploadResult) => void } = {};
      const uploader = fakeUploader({
        upload: () =>
          new Promise<UploadResult>((resolve) => {
            upload.finish = resolve;
          }),
      });
      const { user } = await renderCreate({ uploader });
      await typeInto(user, "Title", "Who keeps the deposit?");
      await user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));
      expect(await screen.findByText("Uploading to IPFS...")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Clear form" }));
      expect(screen.queryByText("Uploading to IPFS...")).toBeNull();
      expect(documentInput()).toBeEnabled();
      await act(async () => {
        upload.finish?.({ ok: true, path: TEST_UPLOAD_PATH });
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(screen.queryByText("Uploaded rules.pdf.")).toBeNull();
      expect(screen.queryByText("rules.pdf")).toBeNull();
      expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
      expect(screen.getByRole("button", { name: "Clear form" })).toBeDisabled();
    });

    it("Clear form removes an upload failure and a refused document's message", async () => {
      const results: UploadResult[] = [
        { ok: false, error: "upload-failed", message: "An error occurred while uploading the file. Please try again. (Network down)" },
        { ok: true, path: "/ipfs/not-a-cid/rules.pdf" },
      ];
      const uploader = fakeUploader({ upload: () => Promise.resolve(results.shift() ?? { ok: true, path: TEST_UPLOAD_PATH }) });
      const { user } = await renderCreate({ uploader });
      for (const message of [/^An error occurred while uploading the file\./, /did not come back as a content-addressed IPFS path/]) {
        await typeInto(user, "Title", "Who keeps the deposit?");
        await user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));
        expect(await screen.findByText(message)).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Clear form" }));
        expect(screen.queryByText(message)).toBeNull();
        expect(screen.getByText(/^Drop a file here or click to select one\./)).toBeInTheDocument();
      }
    });
  });

  describe("changing step", () => {
    function stepsNav(): HTMLElement {
      return screen.getByRole("navigation", { name: "Create dispute steps" });
    }

    it("moves the focus to the summary heading and brings the steps into view on Continue, and back to the form heading on Return", async () => {
      const { user } = await renderCreate({ connect: false });
      await courtsLoaded();
      expect(document.activeElement).toBe(document.body);
      expect(scrollIntoView).not.toHaveBeenCalled();
      await fillToSummary(user);
      expect(screen.getByRole("heading", { level: 1, name: "Who keeps the deposit?" })).toHaveFocus();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(stepsNav());
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", behavior: "smooth" });

      await user.click(screen.getByRole("button", { name: "Return" }));
      expect(screen.getByRole("heading", { level: 1, name: "Create a custom dispute" })).toHaveFocus();
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(scrollIntoView.mock.contexts[1]).toBe(stepsNav());
    });

    it("brings the steps into view without smooth scrolling when the user prefers reduced motion", async () => {
      vi.stubGlobal("matchMedia", matchOnly(["(prefers-reduced-motion: reduce)"]));
      const { user } = await renderCreate({ connect: false });
      await fillToSummary(user);
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest", behavior: "instant" });
    });
  });

  describe("motion", () => {
    const SLIDE_FROM_LEFT = "animate-[t-page-in-left_var(--page-slide-dur)_var(--page-slide-ease)_backwards]";
    const SLIDE_FROM_RIGHT = "animate-[t-page-in-right_var(--page-slide-dur)_var(--page-slide-ease)_backwards]";
    const SWAP_IN = "animate-[t-text-swap-in_var(--text-swap-dur)_var(--text-swap-ease)_backwards]";

    function step(name: "form" | "summary"): HTMLElement {
      const root = document.querySelector(`[data-create-step="${name}"]`);
      if (!(root instanceof HTMLElement)) throw new Error(`no ${name} step`);
      return root;
    }

    /** The grid cell that holds the field labelled `label`. */
    function slotOf(label: string): HTMLElement {
      const slot = screen.getByRole("textbox", { name: label }).closest("[data-field-slot]");
      if (!(slot instanceof HTMLElement)) throw new Error(`no field slot for ${label}`);
      return slot;
    }

    function revealing(text: string): boolean {
      return screen.getByText(text).closest("[class*='t-stagger-in']") !== null;
    }

    it("leaves the form still on the first render, slides the summary in from the right after Continue and the form from the left after Return", async () => {
      const { user } = await renderCreate({ connect: false });
      expect(step("form").className).not.toContain("animate-");
      await fillToSummary(user);
      expect(step("summary").className).toContain(SLIDE_FROM_RIGHT);
      expect(step("summary").className).toContain("motion-reduce:animate-none");
      expect(document.querySelector('[data-create-step="form"]')).toBeNull();

      await user.click(screen.getByRole("button", { name: "Return" }));
      expect(step("form").className).toContain(SLIDE_FROM_LEFT);
      expect(step("form").className).toContain("motion-reduce:animate-none");
      expect(document.querySelector('[data-create-step="summary"]')).toBeNull();
    });

    it("shakes the invalid fields on every failed Continue, never the valid ones, and settles when the shake ends", async () => {
      const { user } = await renderCreate({ connect: false });
      await typeInto(user, "Title", "x");
      expect(slotOf("Question")).not.toHaveAttribute("data-shaking");

      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(slotOf("Question")).toHaveAttribute("data-shaking");
      expect(slotOf("Ruling Option 1")).toHaveAttribute("data-shaking");
      expect(slotOf("Title")).not.toHaveAttribute("data-shaking");
      expect(slotOf("Category (Optional)")).not.toHaveAttribute("data-shaking");

      fireEvent.animationEnd(screen.getByRole("textbox", { name: "Question" }));
      expect(slotOf("Question")).toHaveAttribute("data-shaking");
      fireEvent.animationEnd(slotOf("Question"));
      expect(slotOf("Question")).not.toHaveAttribute("data-shaking");

      await typeInto(user, "Question", "Which party is right?");
      expect(slotOf("Question")).not.toHaveAttribute("data-shaking");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(slotOf("Question")).not.toHaveAttribute("data-shaking");
      expect(slotOf("Ruling Option 1")).toHaveAttribute("data-shaking");
    });

    it("shimmers the waiting labels with their text copied for the sweep", async () => {
      vi.mocked(core.listCourts).mockReturnValue(new Promise(() => undefined));
      vi.mocked(core.readArbitrationCost).mockReturnValue(new Promise(() => undefined));
      const { user } = await renderCreate({ connect: false });
      const calculating = within(screen.getByRole("status", { name: "Arbitration Cost" })).getByText("Calculating...");
      expect(calculating).toHaveClass("t-shimmer");
      expect(calculating).toHaveAttribute("data-text", "Calculating...");

      await fillToSummary(user);
      for (const term of ["Court", "Arbitration Cost"]) {
        const label = summaryValue(term).querySelector(".t-shimmer");
        expect(label).not.toBeNull();
        expect(label?.getAttribute("data-text")).toBe(label?.textContent);
      }
    });

    it("eases in a cost that arrives after Calculating..., but not one already known when the form opens", async () => {
      let resolveCost: ((value: core.Outcome<bigint>) => void) | undefined;
      vi.mocked(core.readArbitrationCost).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCost = resolve;
        }),
      );
      const { user } = await renderCreate({ connect: false });
      await act(async () => {
        resolveCost?.({ ok: true, value: costOf(core.encodeExtraData(0n, 3n)) });
        await Promise.resolve();
      });
      await costShown(costOf(core.encodeExtraData(0n, 3n)), SEPOLIA_CHAIN);
      const arrived = within(screen.getByRole("status", { name: "Arbitration Cost" })).getByText(formatAmount(costOf(core.encodeExtraData(0n, 3n)), SEPOLIA_CHAIN));
      expect(arrived.className).toContain(SWAP_IN);
      expect(arrived.className).toContain("motion-reduce:animate-none");

      await fillToSummary(user);
      await user.click(screen.getByRole("button", { name: "Return" }));
      const known = within(screen.getByRole("status", { name: "Arbitration Cost" })).getByText(formatAmount(costOf(core.encodeExtraData(0n, 3n)), SEPOLIA_CHAIN));
      expect(known.className).not.toContain(SWAP_IN);
    });

    it("reveals the form's attention notice and the created notice as they appear", async () => {
      const { user } = await renderCreate();
      await user.click(screen.getByRole("button", { name: "Continue" }));
      expect(revealing("Some fields need attention")).toBe(true);
      await fillToSummary(user);
      await user.click(screen.getByRole("button", { name: "Create dispute" }));
      await screen.findByText("Dispute 42 created");
      expect(revealing("Dispute 42 created")).toBe(true);
    });
  });

  it.each([
    ["the filled form", false],
    ["the summary", true],
  ] as const)("a wallet chain change on %s returns to page 1 with the form cleared", async (_step, onSummary) => {
    const { user, wallet } = await renderCreate();
    await courtsLoaded();
    await chooseOption(user, "Court", "Blockchain");
    await setNumber(user, "Number of Votes", "5");
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    if (onSummary) await toSummary(user);
    await act(async () => {
      await wallet.changeChain(GNOSIS);
    });
    await waitFor(() => {
      expect(core.listCourts).toHaveBeenLastCalledWith(expect.objectContaining({ chainId: GNOSIS }));
    });
    expect(screen.getByRole("listitem", { name: "Form" })).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("button", { name: "Create dispute" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Ruling Option 1" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Number of Votes" })).toHaveValue("3");
    await courtsLoaded();
    await costShown(costOf(core.encodeExtraData(0n, 3n)), GNOSIS_CHAIN);
  });

  it("the summary shows the title heading, description, court, votes, category, cost with its currency and the ruling options", async () => {
    const { user } = await renderCreate({ connect: false });
    await courtsLoaded();
    await chooseOption(user, "Court", "Blockchain");
    await setNumber(user, "Number of Votes", "5");
    await typeInto(user, "Category (Optional)", "Escrow");
    await fillRequired(user);
    await typeInto(user, "Description (Optional)", "A deposit dispute.");
    await fillOptions(user, ["Yes", "No"]);
    await typeInto(user, "Ruling Option 1 Description (Optional)", "The deposit goes back.");
    await toSummary(user);

    expect(screen.getByText("Summary", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Who keeps the deposit?" })).toBeInTheDocument();
    expect(screen.getByText("A deposit dispute.")).toBeInTheDocument();
    expect(summaryValue("Court")).toHaveTextContent(/^Blockchain$/);
    expect(summaryValue("Number of Votes")).toHaveTextContent(/^5$/);
    expect(summaryValue("Category (Optional)")).toHaveTextContent(/^Escrow$/);
    await waitFor(() => {
      expect(summaryValue("Arbitration Cost")).toHaveTextContent(formatAmount(costOf(core.encodeExtraData(1n, 5n)), SEPOLIA_CHAIN));
    });
    expect(summaryValue("Arbitration Cost")).toHaveTextContent(/ sETH$/);
    expect(summaryValue("Multiple choice: single select")).toHaveTextContent(/^Which party is right\?$/);
    const options = [...summaryValue("Ruling Options").querySelectorAll("li")].map((option) => option.textContent);
    expect(options).toEqual(["YesThe deposit goes back.", "No"]);
  });

  it("says the court is loading on the summary until the court list arrives, then shows its name", async () => {
    let resolveCourts: ((value: core.Outcome<readonly core.Court[]>) => void) | undefined;
    const pending = new Promise<core.Outcome<readonly core.Court[]>>((resolve) => {
      resolveCourts = resolve;
    });
    // Leaving the form cancels its in-flight court fetch and the summary starts another, so every call stays pending.
    vi.mocked(core.listCourts).mockReturnValue(pending);
    const { user } = await renderCreate({ connect: false });
    await fillToSummary(user);
    expect(summaryValue("Court")).toHaveTextContent(/^Loading\.\.\.$/);
    await act(async () => {
      resolveCourts?.({ ok: true, value: COURTS });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(summaryValue("Court")).toHaveTextContent(/^General Court$/);
    });
  });

  it("a court whose policy could not be read is listed and priced by its ID with 'name unavailable', and named so on the summary", async () => {
    const { user } = await renderCreate({ connect: false });
    await courtsLoaded();
    await chooseOption(user, "Court", "Court #2 (name unavailable)");
    expect(select("Court")).toHaveTextContent("Court #2 (name unavailable)");
    await costShown(costOf(core.encodeExtraData(2n, 3n)), SEPOLIA_CHAIN);
    await fillToSummary(user);
    expect(summaryValue("Court")).toHaveTextContent(/^Court #2 \(name unavailable\)$/);
  });

  it("names a court by its ID on the summary when the court list failed, instead of breaking the summary", async () => {
    vi.mocked(core.listCourts).mockResolvedValue({ ok: false, error: { code: "rpc-error", message: "The courts could not be read." } });
    const { user } = await renderCreate({ connect: false });
    expect(await screen.findByText("The courts could not be read.")).toBeInTheDocument();
    await fillToSummary(user);
    expect(summaryValue("Court")).toHaveTextContent(/^Court #0$/);
    expect(summaryValue("Category (Optional)")).toHaveTextContent(/^None$/);
    expect(screen.getByRole("heading", { level: 1, name: "Who keeps the deposit?" })).toBeInTheDocument();
    expect(screen.queryByText("The data for this section is malformed and cannot be displayed.")).toBeNull();
  });

  it("parties can be added and removed with their trash buttons, and their addresses are validated and paired with their aliases", async () => {
    const { user, uploader } = await renderCreate();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await user.click(screen.getByRole("button", { name: "Add party" }));
    await user.click(screen.getByRole("button", { name: "Add party" }));
    await typeInto(user, "Alias 1 (Optional)", "Nobody");
    await user.click(screen.getByRole("button", { name: "Remove party 1" }));
    await typeInto(user, "Alias 1 (Optional)", "Bob");
    await typeInto(user, "Address 1 (Optional)", "0xnot-an-address");
    await typeInto(user, "Alias 2 (Optional)", "Alice");
    await typeInto(user, "Address 2 (Optional)", "0x1111111111111111111111111111111111111111");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/not a valid address/)).toBeInTheDocument();
    await typeInto(user, "Address 1 (Optional)", "0x1111111111111111111111111111111111111111");
    expect(screen.getByText("This address is already used by another party.")).toBeInTheDocument();
    await typeInto(user, "Address 1 (Optional)", "0x2222222222222222222222222222222222222222");
    await toSummary(user);
    expect(screen.getByText("Party 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    await screen.findByText("Dispute 42 created");
    expect(uploadedMetaEvidence(uploader).aliases).toEqual({ "0x2222222222222222222222222222222222222222": "Bob", "0x1111111111111111111111111111111111111111": "Alice" });
  });

  it("an all-uppercase party address is accepted and reaches the summary", async () => {
    const { user, uploader } = await renderCreate();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await typeInto(user, "Alias 1 (Optional)", "Upper");
    await typeInto(user, "Address 1 (Optional)", "0xFB6916095CA1DF60BB79CE92CE3EA74C37C5D359");
    await toSummary(user);
    expect(screen.queryByText(/not a valid address/)).toBeNull();
    expect(screen.getByText("Party 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    await screen.findByText("Dispute 42 created");
    expect(uploadedMetaEvidence(uploader).aliases).toEqual({ "0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359": "Upper" });
  });

  it("the summary shows each party's full checksummed address, not a shortened one", async () => {
    const { user } = await renderCreate();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await typeInto(user, "Alias 1 (Optional)", "Lower");
    await typeInto(user, "Address 1 (Optional)", "0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359");
    await toSummary(user);
    const party = summaryValue("Party 1");
    expect(party).toHaveTextContent("Lower");
    expect(within(party).getByText("0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359")).toHaveClass("font-mono");
    expect(party).not.toHaveTextContent("…");
    expect(within(party).getByRole("button", { name: "Copy address" })).toBeInTheDocument();
  });

  it("the summary names the primary document by its file name and shows its CID beneath", async () => {
    const { user } = await renderCreate();
    await user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));
    await screen.findByText("Uploaded rules.pdf.");
    await fillToSummary(user);
    const primary = summaryValue("Primary Document");
    expect(within(primary).getByRole("link", { name: "rules.pdf" })).toHaveAttribute("href", expect.stringContaining(TEST_UPLOAD_PATH) as string);
    expect(within(primary).getByText(TEST_UPLOAD_CID)).toHaveClass("text-sm", "text-klerosUIComponentsSecondaryText");
  });

  it("nothing is uploaded or signed until the user's first upload action", async () => {
    const { user, uploader } = await renderCreate();
    await fillToSummary(user);
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(uploader.uploadJson).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create dispute" })).toBeEnabled();
  });

  it("a primary document path that is not content-addressed is refused before it enters the draft", async () => {
    const uploader = fakeUploader({ upload: () => Promise.resolve({ ok: true, path: "/ipfs/not-a-cid/rules.pdf" }) });
    const { user } = await renderCreate({ uploader });
    await user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));
    expect(await screen.findByText(/did not come back as a content-addressed IPFS path/)).toBeInTheDocument();
    await fillToSummary(user);
    expect(screen.queryByText("Primary Document")).toBeNull();
  });

  it("without Atlas the document field is locked, the form still reaches the summary, and Create stays disabled with no upload message", async () => {
    const { user, uploader } = await renderCreate({ uploader: fakeUploader({ availability: "unconfigured" }) });
    expect(documentInput()).toBeDisabled();
    expect(document.body).not.toHaveTextContent(/uploads? (are )?unavailable/i);
    await fillToSummary(user);
    const create = screen.getByRole("button", { name: "Create dispute" });
    expect(create).toBeDisabled();
    expect(screen.getByRole("button", { name: "Return" })).toBeEnabled();
    await user.click(create);
    expect(uploader.uploadJson).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(/uploads? (are )?unavailable/i);
  });

  it("multiple select with three options and a primary document creates with 2³ ruling options", async () => {
    const { user, uploader } = await renderCreate();
    await user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));
    await screen.findByText("Uploaded rules.pdf.");
    await chooseOption(user, "Question Type", "Multiple choice: multiple select");
    await setNumber(user, "Number of Options", "3");
    await fillRequired(user);
    await fillOptions(user, ["Red", "Green", "Blue"]);
    await typeInto(user, "Ruling Option 1 Description (Optional)", "The red one");
    await toSummary(user);
    expect(screen.getByRole("link", { name: /rules\.pdf|QmYw/ })).toHaveAttribute("href", expect.stringContaining(TEST_UPLOAD_PATH) as string);
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    await screen.findByText("Dispute 42 created");

    expect(uploader.upload).toHaveBeenCalledWith(expect.any(File), "evidence");
    expect(uploader.uploadJson).toHaveBeenCalledWith("metaEvidence.json", expect.anything(), "policy");
    expect(uploadedMetaEvidence(uploader)).toEqual({
      title: "Who keeps the deposit?",
      category: "",
      description: "",
      aliases: {},
      question: "Which party is right?",
      rulingOptions: { type: "multiple-select", titles: ["Red", "Green", "Blue"], descriptions: ["The red one"] },
      fileURI: TEST_UPLOAD_PATH,
      dynamicScriptURI: `/ipfs/${core.REGISTRY.defaultScriptCid}`,
    });
    const call = createCall(writes.controller ?? fakeWriteController([]));
    expect(call.chainId).toBe(SEPOLIA);
    expect(call.address).toBe(PROXY);
    expect(call.functionName).toBe("createDispute");
    expect(call.args).toEqual([core.encodeExtraData(0n, 3n), TEST_UPLOAD_PATH, 8n]);
    expect(call.value).toBe(costOf(core.encodeExtraData(0n, 3n)));
    expect(writes.controller?.executions[0]?.options.pageChainId).toBe(SEPOLIA);
  });

  it.each([
    ["Sepolia S2", "Non-negative number", "uint"],
    ["Sepolia S3", "Date", "datetime"],
  ] as const)("a $1 question creates with 0 ruling options and no titles", async (_name, label, type) => {
    const { user, uploader } = await renderCreate();
    await chooseOption(user, "Question Type", label);
    expect(screen.queryByRole("textbox", { name: "Number of Options" })).toBeNull();
    await fillRequired(user);
    await toSummary(user);
    expect(screen.getByText(label)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    await screen.findByText("Dispute 42 created");
    expect(uploadedMetaEvidence(uploader).rulingOptions).toEqual({ type, titles: [], descriptions: [] });
    expect(createCall(writes.controller ?? fakeWriteController([])).args[2]).toBe(0n);
  });

  it("single select with two options creates, shows the toast and opens the dispute after 2 seconds", async () => {
    const { user, uploader, currentPath } = await renderCreate();
    await fillToSummary(user);
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(await screen.findByText("You have successfully created dispute 42!")).toBeInTheDocument();
    expect(uploadedMetaEvidence(uploader).rulingOptions).toEqual({ type: "single-select", titles: ["Yes", "No"], descriptions: [] });
    expect(createCall(writes.controller ?? fakeWriteController([])).args[2]).toBe(2n);
    expect(currentPath()).toBe(CREATE_PATH);
    expect(screen.getByRole("button", { name: "Create dispute" })).toBeDisabled();
    await waitFor(
      () => {
        expect(currentPath()).toBe(`/${String(SEPOLIA)}/cases/42`);
      },
      { timeout: 3000 },
    );
  });

  it("a mined transaction without a DisputeCreation log is reported, nothing navigates and Create re-enables", async () => {
    writes.controller = fakeWriteController(minedWith(null));
    const { user, uploader, currentPath } = await renderCreate();
    await fillToSummary(user);
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(await screen.findByText("Dispute ID not found")).toBeInTheDocument();
    expect(screen.queryByText(/successfully created dispute/)).toBeNull();
    expect(screen.getByRole("button", { name: "Create dispute" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Return" })).toBeEnabled();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(currentPath()).toBe(CREATE_PATH);
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    await waitFor(() => {
      expect(writes.controller?.executions).toHaveLength(2);
    });
    expect(uploader.uploadJson).toHaveBeenCalledTimes(1);
  });

  it("a rejected signature is a neutral notice and Create can be tried again with the same upload", async () => {
    writes.controller = fakeWriteController([{ phase: "pending" }, { phase: "rejected" }]);
    const { user, uploader } = await renderCreate();
    await fillToSummary(user);
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(await screen.findByText("Transaction cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create dispute" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    await waitFor(() => {
      expect(writes.controller?.executions).toHaveLength(2);
    });
    expect(uploader.uploadJson).toHaveBeenCalledTimes(1);
  });

  it("a failed transaction is shown as an error", async () => {
    writes.controller = fakeWriteController([
      { phase: "pending" },
      { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null },
      { phase: "failed", hash: TEST_TX_HASH, explorerUrl: null, message: "execution reverted" },
    ]);
    const { user } = await renderCreate();
    await fillToSummary(user);
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(await screen.findByText("Transaction failed")).toBeInTheDocument();
    expect(screen.getByText("execution reverted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create dispute" })).toBeEnabled();
  });

  it.each([
    ["upload-failed", "Upload failed", "error"],
    ["sign-in-rejected", "Sign-in cancelled", "info"],
  ] as const)("a meta-evidence upload that ends with %s is shown and nothing is sent", async (error, title, variant) => {
    const failed: UploadResult = { ok: false, error, message: "Atlas said no." };
    const { user } = await renderCreate({ uploader: fakeUploader({ uploadJson: () => Promise.resolve(failed) }) });
    await fillToSummary(user);
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText("Atlas said no. Nothing was sent.")).toBeInTheDocument();
    expect(screen.queryByRole("alert") !== null).toBe(variant === "error");
    expect(writes.controller?.executions).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Create dispute" })).toBeEnabled();
  });

  it("a failed cost read is shown and nothing is sent", async () => {
    const { user } = await renderCreate();
    await fillToSummary(user);
    vi.mocked(core.readArbitrationCost).mockResolvedValue({ ok: false, error: { code: "reverted", message: "The arbitration cost could not be read." } });
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(await screen.findByText("Arbitration cost unavailable")).toBeInTheDocument();
    expect(writes.controller?.executions).toHaveLength(0);
  });

  it("while the wallet's switch to the page chain waits, Create is disabled and the waiting switch is shown without claiming that nothing was sent", async () => {
    const wallet = holdChainSwitches(createTestWallet({ chainId: 1 }));
    const { user, uploader } = await renderCreate({ wallet });
    await fillToSummary(user);
    expect(screen.getByRole("button", { name: "Create dispute" })).toBeDisabled();
    expect(screen.getByText("Wrong network")).toBeInTheDocument();
    expect(screen.getByText("A switch to Ethereum Testnet Sepolia is waiting in your wallet.")).toBeInTheDocument();
    expect(screen.getByText(/^Your wallet is on .+, but this page is on Ethereum Testnet Sepolia\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was sent/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(uploader.uploadJson).not.toHaveBeenCalled();
    expect(writes.controller?.executions).toHaveLength(0);
  });

  it("a dispute data upload that finishes after a link moved the page to another chain asks the wallet for no transaction", async () => {
    const wallet = holdChainSwitches(createTestWallet({ chainId: SEPOLIA }));
    const upload: { finish?: (result: UploadResult) => void } = {};
    const uploader = fakeUploader({
      uploadJson: () =>
        new Promise<UploadResult>((resolve) => {
          upload.finish = resolve;
        }),
    });
    const user = userEvent.setup();
    const { currentPath } = renderWithProviders(
      <>
        <CreatePage />
        <Link to={`/${String(GNOSIS)}/ongoing`}>Gnosis disputes</Link>
      </>,
      { path: CREATE_PATH, wallet, uploader },
    );
    await act(async () => {
      await wallet.connect();
    });
    await fillToSummary(user);
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(await screen.findByText("Publishing the dispute data")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Gnosis disputes" }));
    expect(currentPath()).toBe(`/${String(GNOSIS)}/ongoing`);
    await act(async () => {
      upload.finish?.({ ok: true, path: TEST_UPLOAD_PATH });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(uploader.uploadJson).toHaveBeenCalledTimes(1);
    expect(writes.controller?.executions).toHaveLength(0);
  });

  it("without a wallet the primary button is Connect and opens the wallet modal on the page chain, with no second Connect button", async () => {
    const { user, uploader, wallet } = await renderCreate({ connect: false });
    await fillToSummary(user);
    expect(screen.getAllByRole("button", { name: "Connect" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Create dispute" })).toBeNull();
    expect(screen.queryByText("Connect a wallet to create a dispute.")).toBeNull();
    expect(screen.queryByText("Wallet required")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(SEPOLIA);
    expect(uploader.uploadJson).not.toHaveBeenCalled();
    expect(screen.queryByText(/configured|deployment/i)).toBeNull();
  });

  it("connecting a wallet on the page chain turns Connect into Create dispute and enables the document field", async () => {
    const { user, wallet, uploader } = await renderCreate({ connect: false });
    expect(documentInput()).toBeDisabled();
    await fillToSummary(user);
    const primary = screen.getByRole("button", { name: "Connect" });
    await act(async () => {
      await wallet.connect();
    });
    expect(screen.getByRole("button", { name: "Create dispute" })).toBe(primary);
    expect(primary).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(uploader.uploadJson).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Return" }));
    expect(documentInput()).toBeEnabled();
  });

  it("the primary document field is locked without a wallet and says why", async () => {
    const { user, uploader } = await renderCreate({ connect: false });
    expect(documentInput()).toBeDisabled();
    expect(documentInput().closest("fieldset")).toBeDisabled();
    expect(screen.getByText("Connect a wallet to upload files.")).toBeInTheDocument();
    await user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it("each party row has a trash button named for its party, beside the address field", async () => {
    const { user } = await renderCreate({ connect: false });
    await user.click(screen.getByRole("button", { name: "Add party" }));
    for (const number of ["1", "2"]) {
      const remove = screen.getByRole("button", { name: `Remove party ${number}` });
      expect(remove).toHaveTextContent(/^$/);
      expect(remove.querySelector("svg")).not.toBeNull();
      const row = remove.closest("li");
      expect(remove.parentElement).toBe(row);
      expect(row).toContainElement(screen.getByRole("textbox", { name: `Address ${number} (Optional)` }));
    }
    expect(screen.queryByText("Remove")).toBeNull();
  });

  it("a chain without a read RPC reports the cost as unavailable with the neutral sentence", async () => {
    const { user } = await renderCreate({ deps: createTestDeps({ unconfiguredChains: [SEPOLIA] }) });
    await fillToSummary(user);
    await waitFor(() => {
      expect(summaryValue("Arbitration Cost")).toHaveTextContent(/^Reads on chain 11155111 are unavailable\.$/);
    });
    await user.click(screen.getByRole("button", { name: "Create dispute" }));
    expect(await screen.findByText("Reads on chain 11155111 are unavailable. Nothing was sent.")).toBeInTheDocument();
    expect(writes.controller?.executions).toHaveLength(0);
  });

  describe("with the real Atlas provider", () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    afterEach(() => {
      sessionStorage.clear();
    });

    it("while the wallet's switch to the page chain waits, the primary document is locked before any sign-in and the waiting switch is shown without claiming that nothing was sent", async () => {
      const wallet = holdChainSwitches(createTestWallet({ chainId: 1 }));
      const { user, server } = await renderWithRealAtlas(wallet);

      expect(documentInput()).toBeDisabled();
      await user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));

      expect(await screen.findByText("Wrong network")).toBeInTheDocument();
      expect(screen.getByText(/^Your wallet is on .+, but this page is on Ethereum Testnet Sepolia\.$/)).toBeInTheDocument();
      expect(screen.queryByText(/Nothing was sent/)).toBeNull();
      expect(screen.getByText("A switch to Ethereum Testnet Sepolia is waiting in your wallet.")).toBeInTheDocument();
      expect(screen.getByText("Wrong network")).toBeInTheDocument();
      expect(screen.getByText(/^Drop a file here or click to select one\./)).toBeInTheDocument();
      expect(server.count("nonce")).toBe(0);
      expect(server.count("sign")).toBe(0);
      expect(server.count("upload")).toBe(0);
    });

    it("with the wallet on the page chain the primary document signs in once, uploads and enters the draft", async () => {
      const wallet = createTestWallet({ chainId: SEPOLIA });
      const { user, server } = await renderWithRealAtlas(wallet);
      await waitFor(() => {
        expect(documentInput()).not.toBeDisabled();
      });

      await user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));

      expect(await screen.findByText("Uploaded rules.pdf.")).toBeInTheDocument();
      expect(server.count("sign")).toBe(1);
      expect(server.count("upload")).toBe(1);
      expect(screen.queryByText("Wrong network")).toBeNull();
    });
  });
});
