import * as core from "@dispute-resolver/core";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { numberToHex, toEventSelector } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadResult } from "../../atlas";
import type { WriteStatus } from "../../wallet";
import { formatAmount } from "../../ui";
import { ToastProvider } from "../../shell";
import { TEST_UPLOAD_PATH, atlasWrapper, fakeUploader, installFakeAtlasServer, type FakeAtlasServer, type FakeUploader } from "../../test/atlas";
import { testCourt } from "../../test/data";
import { renderAtPath } from "../../test/routing";
import { renderWithProviders } from "../../test/shell";
import { TEST_TX_HASH, createTestWallet, fakeWriteController, installOfflineAppKitEnvironment, testReceipt, type FakeWriteController, type TestWallet } from "../../test/wallet";
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
/** A configured chain that can also create disputes, for the chain-change tests (spec §4.1). */
const GNOSIS = 100;

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
  return [{ phase: "pending" }, { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null }, { phase: "mined", hash: TEST_TX_HASH, explorerUrl: null, receipt: { ...testReceipt(), logs } }];
}

interface Rendered {
  readonly user: UserEvent;
  readonly uploader: FakeUploader;
  readonly wallet: TestWallet;
  readonly currentPath: () => string;
}

async function renderCreate(options: { readonly path?: string; readonly uploader?: FakeUploader; readonly wallet?: TestWallet; readonly connect?: boolean } = {}): Promise<Rendered> {
  const uploader = options.uploader ?? fakeUploader();
  const wallet = options.wallet ?? createTestWallet({ chainId: SEPOLIA });
  const user = userEvent.setup();
  const result = renderWithProviders(<CreatePage />, { path: options.path ?? CREATE_PATH, wallet, uploader });
  if (options.connect ?? true) {
    await act(async () => {
      await wallet.connect();
    });
  }
  return { user, uploader, wallet, currentPath: result.currentPath };
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

function documentInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('[data-field="primaryDocument"] input[type="file"]');
  if (input === null) throw new Error("no file input");
  return input;
}

function createPage(): HTMLElement {
  const page = document.querySelector<HTMLElement>('[data-testid="create-page"]');
  if (page === null) throw new Error("create-page missing");
  return page;
}

function field(name: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-field="${name}"]`)];
}

async function chooseOption(user: UserEvent, label: string, option: string) {
  const button = screen.getAllByText(label).find((element) => element.nextElementSibling?.tagName === "BUTTON")?.nextElementSibling;
  if (!(button instanceof HTMLElement)) throw new Error(`no select ${label}`);
  await user.click(button);
  await user.click(await screen.findByRole("option", { name: option }));
}

async function courtsLoaded() {
  await waitFor(() => {
    expect(document.querySelector('[data-testid="create-court"] button')).toHaveTextContent("General Court");
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
  await screen.findByRole("button", { name: "Create" });
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

beforeEach(() => {
  // jsdom has no ResizeObserver, which the library's Steps and popovers use; this double stubs it with the rest of the browser surface.
  installOfflineAppKitEnvironment();
  vi.mocked(core.listCourts).mockResolvedValue({ ok: true, value: COURTS });
  vi.mocked(core.readArbitrationCost).mockImplementation((_client, _chain, extraData) => Promise.resolve({ ok: true, value: costOf(extraData) }));
  writes.controller = fakeWriteController(minedWith(42n));
});

afterEach(() => {
  writes.controller = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("CreatePage", () => {
  it("spec §4.2: a chain without an ArbitrableProxy shows the precondition message and its GitHub issues link", async () => {
    await renderCreate({ path: "/137/create", connect: false });
    expect(createPage()).toHaveAttribute("data-available", "false");
    expect(createPage()).toHaveAttribute("data-chain", "137");
    expect(screen.getByRole("heading", { name: /no arbitrable contract deployed/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub issues/ })).toHaveAttribute("href", "https://github.com/kleros/dispute-resolver/issues");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("04 §1: the Create snapshot hooks carry the chain, courts, default cost, question types, option range and required fields", async () => {
    await renderCreate({ connect: false });
    expect(createPage()).toHaveAttribute("data-available", "true");
    expect(createPage()).toHaveAttribute("data-chain", String(SEPOLIA));
    await waitFor(() => {
      expect(document.querySelector('[data-testid="create-court"]')).toHaveAttribute("data-options", JSON.stringify(["General Court", "Blockchain", "Court #2 (name unavailable)"]));
    });
    await waitFor(() => {
      expect(document.querySelector('[data-testid="create-cost"]')).toHaveAttribute("data-wei", costOf(core.encodeExtraData(0n, 3n)).toString());
    });
    expect(document.querySelector('[data-testid="create-question-type"]')).toHaveAttribute(
      "data-options",
      JSON.stringify(["Multiple choice: single select", "Multiple choice: multiple select", "Non-negative number", "Date"]),
    );
    const range = document.querySelector('[data-testid="create-option-count"]');
    expect(range).toHaveAttribute("data-min", "2");
    expect(range).toHaveAttribute("data-max", "32");
    const byName = (left: string, right: string) => left.localeCompare(right);
    const required = new Set([...document.querySelectorAll('[data-field][data-required="true"]')].map((element) => element.getAttribute("data-field") ?? ""));
    expect([...required].sort(byName)).toEqual(["courtId", "votes", "title", "questionType", "optionCount", "question", "optionTitles"].sort(byName));
    for (const optional of ["category", "description", "optionDescriptions", "partyAliases", "partyAddresses", "primaryDocument"]) {
      expect(field(optional).length).toBeGreaterThan(0);
      for (const element of field(optional)) expect(element).not.toHaveAttribute("data-required");
    }
  });

  it("D-19: a court whose policy could not be read is listed by its ID with 'name unavailable'", async () => {
    const { user } = await renderCreate({ connect: false });
    await courtsLoaded();
    await chooseOption(user, "Court", "Court #2 (name unavailable)");
    await waitFor(() => {
      expect(document.querySelector('[data-testid="create-cost"]')).toHaveAttribute("data-wei", costOf(core.encodeExtraData(2n, 3n)).toString());
    });
  });

  it("spec §4.3: a failed court list degrades the court field with its reason and a retry", async () => {
    vi.mocked(core.listCourts).mockResolvedValueOnce({ ok: false, error: { code: "rpc-error", message: "The courts could not be read." } });
    const { user } = await renderCreate({ connect: false });
    expect(await screen.findByText("The courts could not be read.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(document.querySelector('[data-testid="create-court"]')).toHaveAttribute("data-options");
    });
  });

  it("D-08: input typed while the courts load is kept once they arrive", async () => {
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

  it("spec §4.3, D-08: Continue reports every invalid field and moves on only once the form is valid", async () => {
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

  it("D-08: changing the number of options trims the rows and what is submitted", async () => {
    const { user, uploader } = await renderCreate();
    await fillRequired(user);
    await setNumber(user, "Number of Options", "3");
    await fillOptions(user, ["A", "B", "C"]);
    await setNumber(user, "Number of Options", "2");
    expect(screen.queryByRole("textbox", { name: "Ruling Option 3" })).toBeNull();
    await toSummary(user);
    await user.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByText("Dispute 42 created");
    expect(uploadedMetaEvidence(uploader).rulingOptions.titles).toEqual(["A", "B"]);
  });

  it("spec §4: the steps follow the form and the summary, and the page logs no React warning about DOM attributes", async () => {
    const consoleError = vi.spyOn(console, "error");
    const { user } = await renderCreate({ connect: false });
    await courtsLoaded();
    expect(screen.getByRole("listitem", { name: "Form" })).toHaveAttribute("aria-current", "step");
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    expect(screen.getByRole("listitem", { name: "Summary" })).toHaveAttribute("aria-current", "step");
    expect(consoleError.mock.calls.filter(([message]) => String(message).includes("non-boolean attribute"))).toEqual([]);
  });

  it("D-08: Return keeps every value, the chosen court and its cost", async () => {
    const { user } = await renderCreate({ connect: false });
    await courtsLoaded();
    await chooseOption(user, "Court", "Blockchain");
    await setNumber(user, "Number of Votes", "5");
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    expect(screen.getByText("Blockchain")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return" }));
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Who keeps the deposit?");
    expect(screen.getByRole("textbox", { name: "Ruling Option 2" })).toHaveValue("No");
    expect(screen.getByRole("textbox", { name: "Number of Votes" })).toHaveValue("5");
    expect(document.querySelector('[data-testid="create-court"] button')).toHaveTextContent("Blockchain");
    await waitFor(() => {
      expect(document.querySelector('[data-testid="create-cost"]')).toHaveAttribute("data-wei", costOf(core.encodeExtraData(1n, 5n)).toString());
    });
  });

  it.each([
    ["the filled form", false],
    ["the summary", true],
  ] as const)("spec §8.3, §4.1: a wallet chain change on %s returns to page 1 with the form cleared", async (_step, onSummary) => {
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
      expect(createPage()).toHaveAttribute("data-chain", String(GNOSIS));
    });
    expect(screen.getByRole("listitem", { name: "Form" })).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Ruling Option 1" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Number of Votes" })).toHaveValue("3");
    await courtsLoaded();
  });

  it("spec §4.4: the summary shows the title heading, description, court, votes, category, cost with its currency and the ruling options", async () => {
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

  it("D-36, spec 11.3: a court missing from the court list is named by its ID on the summary instead of breaking it", async () => {
    vi.mocked(core.listCourts).mockResolvedValue({ ok: false, error: { code: "rpc-error", message: "The courts could not be read." } });
    const { user } = await renderCreate({ connect: false });
    expect(await screen.findByText("The courts could not be read.")).toBeInTheDocument();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    expect(summaryValue("Court")).toHaveTextContent(/^Court #0$/);
    expect(summaryValue("Category (Optional)")).toHaveTextContent(/^None$/);
    expect(screen.getByRole("heading", { level: 1, name: "Who keeps the deposit?" })).toBeInTheDocument();
    expect(screen.queryByText("The data for this section is malformed and cannot be displayed.")).toBeNull();
  });

  it("D-08, B20: parties can be added and removed, and their addresses are validated and paired with their aliases", async () => {
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
    await user.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByText("Dispute 42 created");
    expect(uploadedMetaEvidence(uploader).aliases).toEqual({ "0x2222222222222222222222222222222222222222": "Bob", "0x1111111111111111111111111111111111111111": "Alice" });
  });

  it("MC-8: an all-uppercase party address is rejected as invalid", async () => {
    const { user } = await renderCreate({ connect: false });
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await typeInto(user, "Alias 1 (Optional)", "Upper");
    await typeInto(user, "Address 1 (Optional)", "0xFB6916095CA1DF60BB79CE92CE3EA74C37C5D359");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/not a valid address/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Address 1 (Optional)" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  });

  it("A15, D-52: nothing is uploaded or signed until the user's first upload action", async () => {
    const { user, uploader } = await renderCreate();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(uploader.uploadJson).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it("B16, WN-2: a primary document path that is not content-addressed is refused before it enters the draft", async () => {
    const uploader = fakeUploader({ upload: () => Promise.resolve({ ok: true, path: "/ipfs/not-a-cid/rules.pdf" }) });
    const { user } = await renderCreate({ uploader });
    const input = document.querySelector<HTMLInputElement>('[data-field="primaryDocument"] input[type="file"]');
    if (input === null) throw new Error("no file input");
    await user.upload(input, new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));
    expect(await screen.findByText(/did not come back as a content-addressed IPFS path/)).toBeInTheDocument();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    expect(screen.queryByText("Primary Document")).toBeNull();
  });

  it("D-21: without Atlas the document field says uploads are unavailable and the rest of the form works", async () => {
    const { user } = await renderCreate({ uploader: fakeUploader({ availability: "unconfigured" }), connect: false });
    expect(screen.getByText(/unavailable on this deployment/i)).toBeInTheDocument();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
  });

  it("Sepolia S1: multiple select with three options and a primary document creates with 2³ ruling options", async () => {
    const { user, uploader } = await renderCreate();
    const input = document.querySelector<HTMLInputElement>('[data-field="primaryDocument"] input[type="file"]');
    if (input === null) throw new Error("no file input");
    await user.upload(input, new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));
    await screen.findByText("Uploaded rules.pdf.");
    await chooseOption(user, "Question Type", "Multiple choice: multiple select");
    await setNumber(user, "Number of Options", "3");
    await fillRequired(user);
    await fillOptions(user, ["Red", "Green", "Blue"]);
    await typeInto(user, "Ruling Option 1 Description (Optional)", "The red one");
    await toSummary(user);
    expect(screen.getByRole("link", { name: /rules\.pdf|QmYw/ })).toHaveAttribute("href", expect.stringContaining(TEST_UPLOAD_PATH) as string);
    await user.click(screen.getByRole("button", { name: "Create" }));
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
  ] as const)("%s: a %s question creates with 0 ruling options and no titles", async (_name, label, type) => {
    const { user, uploader } = await renderCreate();
    await chooseOption(user, "Question Type", label);
    expect(screen.queryByRole("textbox", { name: "Number of Options" })).toBeNull();
    await fillRequired(user);
    await toSummary(user);
    expect(screen.getByText(label)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByText("Dispute 42 created");
    expect(uploadedMetaEvidence(uploader).rulingOptions).toEqual({ type, titles: [], descriptions: [] });
    expect(createCall(writes.controller ?? fakeWriteController([])).args[2]).toBe(0n);
  });

  it("Sepolia S4, spec §4.6: single select with two options creates, shows the toast and opens the dispute after 2 seconds", async () => {
    const { user, uploader, currentPath } = await renderCreate();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("You have successfully created dispute 42!")).toBeInTheDocument();
    expect(uploadedMetaEvidence(uploader).rulingOptions).toEqual({ type: "single-select", titles: ["Yes", "No"], descriptions: [] });
    expect(createCall(writes.controller ?? fakeWriteController([])).args[2]).toBe(2n);
    expect(currentPath()).toBe(CREATE_PATH);
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    await waitFor(
      () => {
        expect(currentPath()).toBe(`/${String(SEPOLIA)}/cases/42`);
      },
      { timeout: 3000 },
    );
  });

  it("spec §4.6, D-07: a mined transaction without a DisputeCreation log is reported, nothing navigates and Create re-enables", async () => {
    writes.controller = fakeWriteController(minedWith(null));
    const { user, uploader, currentPath } = await renderCreate();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Dispute ID not found")).toBeInTheDocument();
    expect(screen.queryByText(/successfully created dispute/)).toBeNull();
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Return" })).toBeEnabled();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(currentPath()).toBe(CREATE_PATH);
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(writes.controller?.executions).toHaveLength(2);
    });
    expect(uploader.uploadJson).toHaveBeenCalledTimes(1);
  });

  it("D-07: a rejected signature is a neutral notice and Create can be tried again with the same upload", async () => {
    writes.controller = fakeWriteController([{ phase: "pending" }, { phase: "rejected" }]);
    const { user, uploader } = await renderCreate();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Transaction cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(writes.controller?.executions).toHaveLength(2);
    });
    expect(uploader.uploadJson).toHaveBeenCalledTimes(1);
  });

  it("D-07: a failed transaction is shown as an error", async () => {
    writes.controller = fakeWriteController([{ phase: "pending" }, { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null }, { phase: "failed", hash: TEST_TX_HASH, explorerUrl: null, message: "execution reverted" }]);
    const { user } = await renderCreate();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Transaction failed")).toBeInTheDocument();
    expect(screen.getByText("execution reverted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it.each([
    ["upload-failed", "Upload failed", "error"],
    ["sign-in-rejected", "Sign-in cancelled", "info"],
  ] as const)("D-07: a meta-evidence upload that ends with %s is shown and nothing is sent", async (error, title, variant) => {
    const failed: UploadResult = { ok: false, error, message: "Atlas said no." };
    const { user } = await renderCreate({ uploader: fakeUploader({ uploadJson: () => Promise.resolve(failed) }) });
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText("Atlas said no. Nothing was sent.")).toBeInTheDocument();
    expect(screen.queryByRole("alert") !== null).toBe(variant === "error");
    expect(writes.controller?.executions).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it("D-07: a failed cost read is shown and nothing is sent", async () => {
    const { user } = await renderCreate();
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    vi.mocked(core.readArbitrationCost).mockResolvedValue({ ok: false, error: { code: "reverted", message: "The arbitration cost could not be read." } });
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Arbitration cost unavailable")).toBeInTheDocument();
    expect(writes.controller?.executions).toHaveLength(0);
  });

  it("B3, D-48: with the wallet on another chain nothing is uploaded or signed and the switch is offered", async () => {
    const wallet = createTestWallet({ chainId: 1, switchChainError: true });
    const { user, uploader } = await renderCreate({ wallet });
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Wrong network")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Switch to / })).toBeInTheDocument();
    expect(uploader.uploadJson).not.toHaveBeenCalled();
    expect(writes.controller?.executions).toHaveLength(0);
  });

  it("spec §4.5: without a wallet nothing is uploaded and Connect is offered", async () => {
    const { user, uploader, wallet } = await renderCreate({ connect: false });
    await fillRequired(user);
    await fillOptions(user, ["Yes", "No"]);
    await toSummary(user);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Wallet required")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(wallet.modal?.openConnect).toHaveBeenCalledWith(SEPOLIA);
    expect(uploader.uploadJson).not.toHaveBeenCalled();
  });

  describe("with the real Atlas provider", () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    afterEach(() => {
      sessionStorage.clear();
    });

    it("F1, B3, D-48: with the wallet on another chain the primary document is refused before any sign-in and the switch is offered", async () => {
      const wallet = createTestWallet({ chainId: 1, switchChainError: true });
      const { user, server } = await renderWithRealAtlas(wallet);

      await user.upload(documentInput(), new File(["%PDF"], "rules.pdf", { type: "application/pdf" }));

      expect(await screen.findByText("Wrong network")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^Switch to / }));
      expect(screen.getByText("Wrong network")).toBeInTheDocument();
      expect(screen.getByText(/^Drop a file here or click to select one\./)).toBeInTheDocument();
      expect(server.count("nonce")).toBe(0);
      expect(server.count("sign")).toBe(0);
      expect(server.count("upload")).toBe(0);
    });

    it("F1, B3: with the wallet on the page chain the primary document signs in once, uploads and enters the draft", async () => {
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
