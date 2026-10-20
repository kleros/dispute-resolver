import * as core from "@dispute-resolver/core";
import type {
  DisputeEventResult,
  DisputeLookup,
  DisputeReads,
  DisputeView,
  EvidenceItem,
  EvidenceList,
  FamilyDetection,
  MetaEvidenceResult,
  Outcome,
  Period,
  Timeline,
} from "@dispute-resolver/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { Route, Routes, useNavigate, useNavigationType } from "react-router";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence, TEST_ARBITRABLE, TEST_META_EVIDENCE_URI } from "../../test/data";
import { testMetaEvidence } from "../../test/safe-content";
import { renderWithProviders } from "../../test/shell";
import { installOfflineAppKitEnvironment } from "../../test/wallet";
import { CasePage } from "./index";
import { SEARCH_DEBOUNCE_MS } from "./useDisputeSearch";

vi.mock("@dispute-resolver/core", async (importOriginal) => {
  const mocked = await (await import("../../test/data/mockCoreReads")).mockCoreReads(importOriginal);
  return {
    ...mocked,
    realityNotice: vi.fn(mocked.realityNotice),
    buildDisputeView: vi.fn(mocked.buildDisputeView),
    buildAppealPanel: vi.fn(mocked.buildAppealPanel),
  };
});

/** The evidence-display URI whose display the mocked builder cannot build (P-26); every other input builds as in production. */
const { BROKEN_DISPLAY_URI } = vi.hoisted(() => ({ BROKEN_DISPLAY_URI: "/ipfs/QmQ2XoA25HmnPUEWDduxj6LYwMwp6jtXPFRMHcNF2EvJfU/broken.html" }));

vi.mock("../../safe-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../safe-content")>();
  return {
    ...actual,
    buildEvidenceDisplay: (...args: Parameters<typeof actual.buildEvidenceDisplay>) => {
      if (args[0].metaEvidence.evidenceDisplayInterfaceURI === BROKEN_DISPLAY_URI) throw new Error("display builder failed");
      return actual.buildEvidenceDisplay(...args);
    },
  };
});

const actualCore = await vi.importActual<typeof core>("@dispute-resolver/core");

const EVIDENCE: EvidenceList = {
  items: [],
  hiddenEvidenceCount: 0,
  hiddenByReason: { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 },
};
const FOUND_EVENT: Outcome<DisputeEventResult> = {
  ok: true,
  value: { status: "found", event: { metaEvidenceId: 0n, evidenceGroupId: 3n, blockNumber: 100n, createdAt: 1_700_000_000, transactionHash: "0x01" } },
};
const GOVERNOR: FamilyDetection = testFamily({
  family: "governor",
  writeFamily: "governor",
  capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
});

interface Program {
  readonly period?: Period;
  readonly family?: FamilyDetection;
  /** Lookups by dispute ID; an ID without one is not found. */
  readonly lookups?: Readonly<Record<string, DisputeLookup>>;
  /** Meta-evidence by dispute ID; an ID without one has the test meta-evidence. */
  readonly metaEvidence?: Readonly<Record<string, MetaEvidenceResult | "pending">>;
}

/** Programs core's reads (S-7): dispute 1 on chain 1 by default, in `period`, every read successful. */
function programReads(program: Program = {}): void {
  const period = program.period ?? 0;
  const lookups = program.lookups ?? { "1": testFoundLookup({ period }) };
  vi.mocked(core.lookupDispute).mockImplementation((_context, id) => Promise.resolve(lookups[id.toString()] ?? { status: "not-found" }));
  vi.mocked(core.detectFamily).mockResolvedValue(program.family ?? testFamily());
  vi.mocked(core.loadMetaEvidence).mockImplementation((context) => {
    const result = program.metaEvidence?.[context.disputeId.toString()] ?? testOkMetaEvidence({ title: `Dispute ${context.disputeId.toString()} title` });
    return result === "pending" ? new Promise<MetaEvidenceResult>(() => undefined) : Promise.resolve(result);
  });
  vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_EVENT);
  vi.mocked(core.loadEvidence).mockResolvedValue({ ok: true, value: EVIDENCE });
  vi.mocked(core.listCourts).mockResolvedValue({ ok: true, value: [testCourt({ name: "General Court" })] });
  vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
    Promise.resolve(
      testDetails(
        { status: "found", ...found },
        { appealInfo: found.dispute.period >= 3 ? { ok: true, value: { appealCost: 1_000n, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 } } : null },
      ),
    ),
  );
  vi.mocked(core.readMultipliers).mockResolvedValue({
    ok: true,
    value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n },
  });
  vi.mocked(core.readRoundFunding).mockImplementation((_context, round) => Promise.resolve({ ok: true, value: { round, contributions: [], fundedRulings: [] } }));
  vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "nothing" });
}

/** Moves the app to another URL, as the header or a chain change would. */
function GoTo({ to }: { readonly to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        void navigate(to);
      }}
    >
      Go to {to}
    </button>
  );
}

/** How the router reached the current URL: a push, a replace or a pop (the history replace of spec 1.4). */
function NavigationType() {
  return <p>{`Navigation: ${useNavigationType()}`}</p>;
}

/** The case page under the app's `/:chainId` layout, at the route the app serves it on (S-2). */
function renderCase(path: string, goTo?: string) {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="cases/:id?" element={<CasePage />} />
      </Routes>
      <NavigationType />
      {goTo === undefined ? null : <GoTo to={goTo} />}
    </>,
    { path },
  );
}

/** The case header, a region named after the dispute it shows. */
function caseHeader(id: number): HTMLElement {
  return screen.getByRole("region", { name: `Dispute #${String(id)}` });
}

/** Waits until dispute `id` has settled: its header shows the court, which renders only from the settled view. */
async function settledDispute(id = 1): Promise<HTMLElement> {
  await waitFor(() => {
    expect(within(caseHeader(id)).getByText("General Court")).toBeInTheDocument();
  });
  return caseHeader(id);
}

/** The value of one entry of the header's info row, found by its visible label. */
function headerDetail(header: HTMLElement, label: string): HTMLElement {
  const index = within(header)
    .getAllByRole("term")
    .findIndex((term) => term.textContent === label);
  const value = within(header).getAllByRole("definition")[index];
  if (index === -1 || value === undefined) throw new Error(`No info row entry labelled ${label}.`);
  return value;
}

/** The summary title of a dispute this file programs (`Dispute N title`), when one shows. */
function queryTitle(): HTMLElement | null {
  return screen.queryByRole("heading", { level: 2, name: /^Dispute \d+ title$/ });
}

function notFoundHeading(id: string): HTMLElement {
  return screen.getByRole("heading", { level: 1, name: `Dispute with ID ${id} does not exist on this network.` });
}

/** The page message of each state that shows no dispute (spec 5.1, 5.4, D-36). */
const PAGE_MESSAGE = /^(?:Find a dispute|Dispute with ID .+ does not exist on this network\.|Dispute #\d+ could not be loaded)$/;

/** No dispute is found yet: placeholders stand in, no page message shows, and the accordion of a found dispute is absent. */
function expectLoading(): void {
  expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  expect(screen.queryByRole("heading", { level: 1, name: PAGE_MESSAGE })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Question" })).not.toBeInTheDocument();
}

/** The Court link of the search row; the Question panel has a Court link of its own. */
function searchCourtLink(): HTMLElement {
  return within(screen.getByRole("search")).getByRole("link", { name: "Court" });
}

/** The timeline's columns, as list items of the list a reader hears as "Dispute timeline". */
function timelineColumns(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "Dispute timeline" })).getAllByRole("listitem");
}

function searchField(): HTMLElement {
  return screen.getByRole("textbox", { name: "Dispute ID" });
}

/**
 * Runs a user-event interaction inside act(), so every update it scheduled is committed when it returns. user-event
 * dispatches outside act() in this setup: it loads its own copy of @testing-library/dom, which RTL never configures.
 * The router commits a URL change in a transition, on React's scheduler, so without act() the URL would land some time
 * after the interaction returns, later on a loaded machine.
 */
async function interact(steps: (user: UserEvent) => Promise<void>) {
  const user = userEvent.setup();
  await act(() => steps(user));
}

/** Empties the search field and types `text` (none for an empty field). */
async function search(text: string) {
  await interact(async (user) => {
    await user.clear(searchField());
    if (text !== "") await user.type(searchField(), text);
  });
}

/** The search debounce, held by the test. */
interface SearchDebounce {
  /** How many debounces wait to elapse. */
  readonly pending: number;
  /** Lets every waiting debounce elapse now, inside act(), so the load it starts has begun when this returns. */
  elapse(): void;
}

/**
 * Holds the search debounce instead of scheduling it (D-53, P-19): the hook's `setTimeout(…, SEARCH_DEBOUNCE_MS)` is
 * recorded, and the debounce elapses only when the test calls `elapse()`, never by the wall clock. A real 750 ms timer
 * on a loaded machine can fire before an "at once" assertion runs, or use up most of the wait that follows it. Every
 * other timer (React Query's, user-event's, waitFor's, the accordion's) runs as usual; nothing else on this page waits
 * exactly 750 ms. `vi.restoreAllMocks()` puts the real timers back.
 */
function holdSearchDebounce(): SearchDebounce {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const held = new Map<ReturnType<typeof setTimeout>, () => void>();
  const issued = new Set<ReturnType<typeof setTimeout>>();
  vi.spyOn(globalThis, "setTimeout").mockImplementation((handler, delay, ...args) => {
    if (delay !== SEARCH_DEBOUNCE_MS) return realSetTimeout(handler, delay, ...args);
    // A real timer cancelled at once: a handle of the real type that no live timer shares.
    const handle = realSetTimeout(() => undefined, 0);
    realClearTimeout(handle);
    issued.add(handle);
    held.set(handle, () => {
      handler(...args);
    });
    return handle;
  });
  vi.spyOn(globalThis, "clearTimeout").mockImplementation((handle) => {
    if (handle !== undefined && typeof handle === "object" && issued.has(handle)) held.delete(handle);
    else realClearTimeout(handle);
  });
  return {
    get pending() {
      return held.size;
    },
    elapse() {
      const due = [...held.values()];
      held.clear();
      act(() => {
        for (const run of due) run();
      });
    },
  };
}

function accordionButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

/**
 * The element of `role` labelled `label` inside `scope`, hidden or not. A hidden element has no accessible name, so it is
 * matched on its label.
 */
function labelled(scope: HTMLElement, role: string, label: string): HTMLElement {
  const element = within(scope)
    .getAllByRole(role, { hidden: true })
    .find((candidate) => candidate.getAttribute("aria-label") === label);
  if (element === undefined) throw new Error(`No ${role} labelled ${label}.`);
  return element;
}

/** The body of an accordion item, a region labelled after it; a collapsed one is hidden. */
function accordionBody(name: string): HTMLElement {
  return labelled(document.body, "region", name);
}

/** React logs every render error a boundary catches and reports it to the window, where jsdom prints it; both are expected. */
function expectRenderErrors() {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const silence = (event: ErrorEvent) => {
    event.preventDefault();
  };
  window.addEventListener("error", silence);
  onTestFinished(() => {
    window.removeEventListener("error", silence);
  });
}

/** A text React cannot render: a plain object where a string belongs, as a bad dispute's data can hold (spec 11.3). */
const UNRENDERABLE = { malformed: true } as unknown as string;
/** A text a template string cannot print: a symbol where a string belongs. */
const UNPRINTABLE = Symbol("malformed") as unknown as string;
/**
 * The current ruling of a malformed details read. Core formats every value the timeline, the decision and the appeal
 * cards show, so no read can make them throw; the view and panel stubs below turn this read into one they cannot render.
 */
const MALFORMED_RULING = 99n;
const APPEAL_INFO = { appealCost: 1_000n, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 } as const;
const RPC_DOWN = { code: "rpc-error", message: "The RPC did not answer." } as const;

type ExistingView = Extract<DisputeView, { exists: true }>;

/** The details read of dispute 1 in `period` with `currentRuling`, every other read successful. */
function detailsRead(period: Period, currentRuling: bigint, overrides: Partial<DisputeReads> = {}): DisputeReads {
  return testDetails(testFoundLookup({ period }), {
    currentRuling: { ok: true, value: currentRuling },
    appealInfo: period >= 3 ? { ok: true, value: APPEAL_INFO } : null,
    ...overrides,
  });
}

function isMalformed(currentRuling: Outcome<bigint> | undefined): boolean {
  return currentRuling?.ok === true && currentRuling.value === MALFORMED_RULING;
}

/** The view core builds, with `patch` applied when it is built from a malformed details read. */
function breakViewOnMalformedDetails(patch: Partial<ExistingView>) {
  vi.mocked(core.buildDisputeView).mockImplementation((input) => {
    const view = actualCore.buildDisputeView(input);
    return view.exists && isMalformed(input.reads?.currentRuling) ? { ...view, ...patch } : view;
  });
}

/** The appeal panel core builds, its card titles unrenderable when it is built from a malformed details read. */
function breakAppealCardsOnMalformedDetails() {
  vi.mocked(core.buildAppealPanel).mockImplementation((input) => {
    const panel = actualCore.buildAppealPanel(input);
    if (panel.kind !== "crowdfunding" || !isMalformed(input.currentRuling)) return panel;
    return { ...panel, cards: panel.cards.map((card) => ({ ...card, title: UNRENDERABLE })) };
  });
}

function evidenceRead(items: readonly EvidenceItem[]): Outcome<EvidenceList> {
  return { ok: true, value: { ...EVIDENCE, items } };
}

function evidenceItem(title: string): EvidenceItem {
  return {
    title,
    description: "",
    submitter: "0x2222222222222222222222222222222222222222",
    timestamp: 1_700_000_500,
    blockNumber: 500n,
    transactionHash: "0x02",
    uri: TEST_META_EVIDENCE_URI,
    attachment: null,
  };
}

/** One case-page section with a Retry: what breaks it, what its Retry reads again, and what it shows once that read is good. */
interface RetryCase {
  /** The section's name, as in "{section} unavailable" and "Retry {section}". */
  readonly section: string;
  /** The rows and ledger entries the case's test names carry, when not the defaults of `breaks`. */
  readonly rows?: string;
  /** How a bad read breaks it: its render throws (its boundary catches it, D-36), or its data is unavailable. */
  readonly breaks: "throws" | "fails";
  /** The accordion item holding the section, opened before Retry; a section above the accordion has none. */
  readonly item?: "Appeal" | "Question" | "Evidence";
  readonly period?: Period;
  /** Programs the read the section's Retry repeats: its first `badReads` answers break the section, later ones are good. */
  readonly program: (badReads: number) => void;
  /** How many times that read ran. */
  readonly reads: () => number;
  /** The section's content from a good read. */
  readonly content: () => Promise<HTMLElement>;
}

interface ProgrammableRead<T> {
  mockResolvedValue(value: T): unknown;
  mockResolvedValueOnce(value: T): unknown;
  readonly mock: { readonly calls: readonly unknown[] };
}

/** A read whose first `badReads` answers are `bad` and every later one `good`; `before` installs what the case needs first. */
function answers<T>(read: ProgrammableRead<T>, bad: T, good: T, before?: () => void): Pick<RetryCase, "program" | "reads"> {
  return {
    program: (badReads) => {
      before?.();
      read.mockResolvedValue(good);
      for (let count = 0; count < badReads; count += 1) read.mockResolvedValueOnce(bad);
    },
    reads: () => read.mock.calls.length,
  };
}

const metaEvidenceReads = vi.mocked(core.loadMetaEvidence);
const detailsReads = vi.mocked(core.readDisputeDetails);
const GOOD_META_EVIDENCE = testOkMetaEvidence({ title: "Dispute 1 title", question: "Who should win?" });
const FAILED_META_EVIDENCE: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "The meta-evidence file could not be fetched." } };

const RETRY_CASES: readonly RetryCase[] = [
  {
    section: "Dispute details",
    breaks: "throws",
    ...answers(vi.mocked(core.listCourts), { ok: true, value: [testCourt({ name: UNRENDERABLE })] }, { ok: true, value: [testCourt({ name: "General Court" })] }),
    content: () => screen.findByText("General Court"),
  },
  {
    section: "Dispute summary",
    breaks: "throws",
    ...answers(metaEvidenceReads, testOkMetaEvidence({ title: UNRENDERABLE }), GOOD_META_EVIDENCE),
    content: () => screen.findByRole("heading", { level: 2, name: "Dispute 1 title" }),
  },
  {
    section: "Timeline",
    breaks: "throws",
    ...answers(detailsReads, detailsRead(0, MALFORMED_RULING), detailsRead(0, 1n), () => {
      breakViewOnMalformedDetails({ timeline: { ok: true, value: { columns: null as unknown as Timeline["columns"] } } });
    }),
    content: () => screen.findByRole("list", { name: "Dispute timeline" }),
  },
  {
    section: "Decision",
    breaks: "throws",
    period: 3,
    ...answers(detailsReads, detailsRead(3, MALFORMED_RULING), detailsRead(3, 1n), () => {
      breakViewOnMalformedDetails({ decision: { ok: true, value: { kind: "jury-decision", ruling: 1n, rulingText: UNRENDERABLE, appealHint: false } } });
    }),
    content: () => screen.findByRole("heading", { level: 2, name: "Jury decision" }),
  },
  {
    section: "Reality notice",
    breaks: "throws",
    ...answers(
      metaEvidenceReads,
      testOkMetaEvidence({ title: "Dispute 1 title", realityQuestion: { status: "unverified", title: UNPRINTABLE } }),
      testOkMetaEvidence({ title: "Dispute 1 title", realityQuestion: { status: "unverified", title: "Will it rain?" } }),
    ),
    content: () => screen.findByText("The answer options of this question could not be verified"),
  },
  {
    section: "Appeal",
    breaks: "throws",
    item: "Appeal",
    period: 3,
    ...answers(detailsReads, detailsRead(3, MALFORMED_RULING), detailsRead(3, 1n), breakAppealCardsOnMalformedDetails),
    content: () => within(accordionBody("Appeal")).findByRole("list", { name: "Rulings to fund" }),
  },
  {
    section: "Question",
    breaks: "throws",
    item: "Question",
    ...answers(metaEvidenceReads, testOkMetaEvidence({ title: "Dispute 1 title", question: UNRENDERABLE }), GOOD_META_EVIDENCE),
    content: () => within(accordionBody("Question")).findByText("Who should win?"),
  },
  {
    section: "Evidence",
    breaks: "throws",
    item: "Evidence",
    ...answers(vi.mocked(core.loadEvidence), evidenceRead([evidenceItem(UNRENDERABLE)]), evidenceRead([evidenceItem("Recovered evidence")])),
    content: () => within(accordionBody("Evidence")).findByRole("heading", { level: 3, name: "Recovered evidence" }),
  },
  {
    section: "Evidence display",
    rows: "P-26, S-3",
    breaks: "throws",
    ...answers(
      metaEvidenceReads,
      testOkMetaEvidence({ title: "Dispute 1 title", evidenceDisplayInterfaceURI: BROKEN_DISPLAY_URI }),
      testOkMetaEvidence({ title: "Dispute 1 title", evidenceDisplayInterfaceURI: "/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html" }),
    ),
    content: () => screen.findByTitle("Evidence display"),
  },
  {
    section: "Dispute summary",
    breaks: "fails",
    ...answers(metaEvidenceReads, FAILED_META_EVIDENCE, GOOD_META_EVIDENCE),
    content: () => screen.findByRole("heading", { level: 2, name: "Dispute 1 title" }),
  },
  {
    section: "Question",
    breaks: "fails",
    item: "Question",
    ...answers(metaEvidenceReads, FAILED_META_EVIDENCE, GOOD_META_EVIDENCE),
    content: () => within(accordionBody("Question")).findByText("Who should win?"),
  },
  {
    section: "Evidence",
    breaks: "fails",
    item: "Evidence",
    ...answers(vi.mocked(core.loadEvidence), { ok: false, error: RPC_DOWN }, evidenceRead([evidenceItem("Recovered evidence")])),
    content: () => within(accordionBody("Evidence")).findByRole("heading", { level: 3, name: "Recovered evidence" }),
  },
  {
    section: "Appeal markers",
    breaks: "fails",
    item: "Evidence",
    ...answers(
      detailsReads,
      detailsRead(0, 1n, { appealDecisions: { ok: false, error: RPC_DOWN } }),
      detailsRead(0, 1n, { appealDecisions: { ok: true, value: [{ blockNumber: 600n, appealedAt: 1_700_000_600 }] } }),
    ),
    content: () => within(accordionBody("Evidence")).findByText("Appealed"),
  },
  {
    section: "Evidence submission",
    breaks: "fails",
    item: "Evidence",
    program: (badReads) => {
      detailsReads.mockResolvedValue(detailsRead(0, 1n));
      for (let count = 0; count < badReads; count += 1) detailsReads.mockRejectedValueOnce(new Error(RPC_DOWN.message));
    },
    reads: () => detailsReads.mock.calls.length,
    content: () => within(accordionBody("Evidence")).findByRole("button", { name: "Submit New Evidence" }),
  },
];

/** Renders dispute 1 with `retryCase`'s section broken by its first `badReads` reads, its accordion item open. */
async function renderBrokenSection(retryCase: RetryCase, badReads: number) {
  if (retryCase.breaks === "throws") expectRenderErrors();
  programReads({ period: retryCase.period ?? 0 });
  retryCase.program(badReads);
  renderCase("/1/cases/1");
  expect(await screen.findByText(`${retryCase.section} unavailable`)).toBeInTheDocument();
  const { item } = retryCase;
  if (item !== undefined) {
    await userEvent.setup().click(accordionButton(item));
    await waitFor(() => {
      expect(accordionBody(item)).toBeVisible();
    });
  }
  expect(retryCase.reads()).toBe(1);
}

async function pressRetry(section: string) {
  await userEvent.setup().click(screen.getByRole("button", { name: `Retry ${section}` }));
}

/** The section shows its content from a good read, with no notice and no Retry left. */
async function expectRecovered(retryCase: RetryCase) {
  expect(await retryCase.content()).toBeInTheDocument();
  expect(screen.queryByText(`${retryCase.section} unavailable`)).toBeNull();
  expect(screen.queryByRole("button", { name: `Retry ${retryCase.section}` })).toBeNull();
}

let breakRealityNotice = false;
let debounce: SearchDebounce;

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no ResizeObserver, which the library accordion uses; this double stubs it with the rest of the browser surface.
  installOfflineAppKitEnvironment();
  debounce = holdSearchDebounce();
  breakRealityNotice = false;
  vi.mocked(core.realityNotice).mockImplementation((question) => {
    if (breakRealityNotice) throw new Error("Malformed Reality question");
    return actualCore.realityNotice(question);
  });
  vi.mocked(core.buildDisputeView).mockImplementation(actualCore.buildDisputeView);
  vi.mocked(core.buildAppealPanel).mockImplementation(actualCore.buildAppealPanel);
  programReads();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("case page states (spec 5.1, 5.4)", () => {
  it("D-09: the case page without an ID shows the search box and loads no dispute", () => {
    renderCase("/1/cases");
    expect(searchField()).toHaveValue("");
    expect(screen.getByRole("heading", { level: 1, name: "Find a dispute" })).toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("A19: an ID that does not parse is the not-found state, read nowhere and linked nowhere", () => {
    renderCase("/1/cases/abc");
    expect(notFoundHeading("abc")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/1/ongoing");
    expect(document.querySelectorAll("a[href*='abc']")).toHaveLength(0);
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("spec 5.4: a dispute the arbitrator does not know shows the not-found state with a link to Ongoing", async () => {
    renderCase("/1/cases/42");
    await waitFor(() => {
      expect(notFoundHeading("42")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/1/ongoing");
    expect(screen.queryByRole("heading", { name: "Dispute #42" })).not.toBeInTheDocument();
    expect(searchField()).toHaveValue("42");
  });

  it("spec 5.4: a chain without an arbitrator shows the not-found copy and reads nothing", () => {
    renderCase("/137/cases/5");
    expect(notFoundHeading("5")).toBeInTheDocument();
    expect(screen.getByText(/There is no arbitrator on/)).toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("D-36: a lookup that fails in transport is unavailable, not missing, with a Retry that reads it again", async () => {
    vi.mocked(core.lookupDispute).mockRejectedValueOnce(new Error("socket hang up"));
    renderCase("/1/cases/1");
    expect(await screen.findByRole("heading", { level: 1, name: "Dispute #1 could not be loaded" })).toBeInTheDocument();
    expect(screen.queryByText(/does not exist/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry loading dispute 1" }));
    await settledDispute();
    expect(core.lookupDispute).toHaveBeenCalledTimes(2);
  });

  it("D-36: a lookup the arbitrator answers as unavailable shows the unavailable state, not 'does not exist'", async () => {
    programReads({ lookups: { "1": { status: "unavailable", error: { code: "rpc-error", message: "The arbitrator did not answer." } } } });
    renderCase("/1/cases/1");
    expect(await screen.findByRole("heading", { level: 1, name: "Dispute #1 could not be loaded" })).toBeInTheDocument();
    expect(screen.getByText("The arbitrator did not answer.")).toBeInTheDocument();
    expect(screen.queryByText(/does not exist/)).not.toBeInTheDocument();
  });

  it("spec 5.5, 5.8, 5.10, A22: a found dispute shows its header and summary, read for the arbitrator's arbitrable, with no banner or notice", async () => {
    programReads({ period: 2, family: testFamily({ family: "idr-v1" }) });
    renderCase("/1/cases/1");
    const header = await settledDispute();
    expect(within(header).getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(within(header).getByText("Voting")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Dispute 1 title" })).toBeInTheDocument();
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ disputeId: 1n, arbitrable: TEST_ARBITRABLE }));
    expect(screen.queryByText("View mode only for this dispute")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/^The answer options of this question|^Other interfaces may show different answer options|^The question parameters are malformed/),
    ).not.toBeInTheDocument();
  });

  it("P-19: the URL's dispute is read at mount, without the search debounce", async () => {
    renderCase("/1/cases/1");
    await act(() => Promise.resolve());
    expect(core.lookupDispute).toHaveBeenCalledWith(expect.anything(), 1n);
  });

  it("P-20: while the lookup runs the search box and section placeholders show", () => {
    vi.mocked(core.lookupDispute).mockReturnValue(new Promise<DisputeLookup>(() => undefined));
    renderCase("/1/cases/1");
    expectLoading();
    expect(searchField()).toBeInTheDocument();
    expect(queryTitle()).not.toBeInTheDocument();
  });

  it("P-20: the header renders from the lookup while the meta-evidence still loads", async () => {
    programReads({ period: 1, metaEvidence: { "1": "pending" } });
    renderCase("/1/cases/1");
    await waitFor(() => {
      expect(within(caseHeader(1)).getByText("Commit")).toBeInTheDocument();
    });
    expect(within(caseHeader(1)).getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(queryTitle()).not.toBeInTheDocument();
    // The court renders from the settled view, so the view has not settled.
    expect(within(caseHeader(1)).queryByText("General Court")).not.toBeInTheDocument();
  });
});

describe("compatibility banner (spec 5.5)", () => {
  it("spec 5.5: a view-only dispute shows the 'View mode only' banner", async () => {
    programReads({ family: GOVERNOR });
    renderCase("/1/cases/1");
    expect(await screen.findByText("View mode only for this dispute")).toBeInTheDocument();
    expect(screen.getByText(/You can't submit evidence or fund appeals on this interface\./)).toBeInTheDocument();
  });

  it("D-36, spec 5.5: a family that could not be detected is view-only, and the page still renders", async () => {
    vi.mocked(core.detectFamily).mockRejectedValue(new Error("socket hang up"));
    renderCase("/1/cases/1");
    await settledDispute();
    expect(screen.getByText("View mode only for this dispute")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Dispute 1 title" })).toBeInTheDocument();
  });

  it("spec 5.5: a compatible dispute shows no banner", async () => {
    renderCase("/1/cases/1");
    await settledDispute();
    expect(screen.queryByText("View mode only for this dispute")).not.toBeInTheDocument();
  });
});

describe("accordion (spec 5.11)", () => {
  it("spec 5.11: before the appeal period the accordion holds Question and Evidence, all collapsed", async () => {
    renderCase("/1/cases/1");
    await settledDispute();
    expect(screen.queryByRole("button", { name: "Appeal" })).not.toBeInTheDocument();
    for (const name of ["Question", "Evidence"]) {
      expect(accordionButton(name)).toHaveAttribute("aria-expanded", "false");
      expect(accordionBody(name)).not.toBeVisible();
    }
  });

  it("spec 5.11: from the appeal period the Appeal panel comes first", async () => {
    programReads({ period: 3 });
    renderCase("/1/cases/1");
    await settledDispute();
    const titles = screen.getAllByRole("button", { expanded: false }).map((button) => button.textContent);
    expect(titles.slice(0, 3)).toEqual(["Appeal", "Question", "Evidence"]);
    // Only the crowdfunding panel lists rulings to fund.
    await waitFor(() => {
      expect(labelled(accordionBody("Appeal"), "list", "Rulings to fund")).toBeInTheDocument();
    });
  });

  it("spec 5.11: one panel is open at a time, and a collapsed body stays mounted but hidden", async () => {
    renderCase("/1/cases/1");
    await settledDispute();
    const user = userEvent.setup();
    await user.click(accordionButton("Question"));
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => {
      expect(accordionBody("Question")).toBeVisible();
    });
    expect(within(accordionBody("Question")).getByText("Multiple choice: single select")).toBeInTheDocument();
    await user.click(accordionButton("Evidence"));
    await waitFor(() => {
      expect(accordionBody("Evidence")).toBeVisible();
    });
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(accordionBody("Question")).not.toBeVisible();
    });
    expect(within(accordionBody("Question")).getByText("Multiple choice: single select")).toBeInTheDocument();
  });
});

describe("search box (spec 5.2, D-53)", () => {
  it("spec 5.2: the label links Court to the shown dispute on Court", async () => {
    renderCase("/100/cases/7");
    expect(screen.getByRole("search", { name: "Search Disputes on Court" })).toBeInTheDocument();
    expect(searchCourtLink()).toHaveAttribute("href", "https://court.kleros.io/cases/7?requiredChainId=100");
    expect(searchCourtLink()).toHaveAttribute("target", "_blank");
    await waitFor(() => {
      expect(notFoundHeading("7")).toBeInTheDocument();
    });
  });

  it("spec 1.4, 5.2: every change replaces the URL at once, and only the load waits for the debounce", async () => {
    programReads({ lookups: { "1": testFoundLookup(), "34": testFoundLookup({ disputeId: 34n }) } });
    const view = renderCase("/1/cases/1");
    await settledDispute();
    await search("3");
    expect(view.currentPath()).toBe("/1/cases/3");
    expect(screen.getByText("Navigation: REPLACE")).toBeInTheDocument();
    await interact((user) => user.type(searchField(), "4"));
    expect(searchField()).toHaveValue("34");
    expect(view.currentPath()).toBe("/1/cases/34");
    expectLoading();
    expect(core.lookupDispute).not.toHaveBeenCalledWith(expect.anything(), 34n);
    // The second key restarted the debounce: the one the first key started is gone.
    expect(debounce.pending).toBe(1);

    debounce.elapse();
    expect(await screen.findByRole("heading", { level: 2, name: "Dispute 34 title" })).toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalledWith(expect.anything(), 3n);
    expect(searchField()).toHaveValue("34");
  });

  it("D-53: a search clears the shown dispute at once and loads the new ID after the debounce", async () => {
    programReads({ lookups: { "1": testFoundLookup(), "2": testFoundLookup({ disputeId: 2n }) } });
    const view = renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByRole("heading", { level: 2, name: "Dispute 1 title" })).toBeInTheDocument();

    await search("2");
    expect(view.currentPath()).toBe("/1/cases/2");
    expectLoading();
    expect(queryTitle()).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dispute #1" })).not.toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalledWith(expect.anything(), 2n);
    expect(debounce.pending).toBe(1);

    debounce.elapse();
    expect(await screen.findByRole("heading", { level: 2, name: "Dispute 2 title" })).toBeInTheDocument();
    expect(searchCourtLink()).toHaveAttribute("href", "https://court.kleros.io/cases/2?requiredChainId=1");
  });

  it("D-53: searching a nonexistent ID while a dispute is shown shows the not-found state", async () => {
    renderCase("/1/cases/1");
    await settledDispute();
    await search("99");
    debounce.elapse();
    await waitFor(() => {
      expect(notFoundHeading("99")).toBeInTheDocument();
    });
    expect(queryTitle()).not.toBeInTheDocument();
  });

  it("spec 5.1, 5.2: clearing the search shows no dispute and leaves the URL as it is", async () => {
    const view = renderCase("/1/cases/1");
    await settledDispute();
    await search("");
    expect(screen.getByRole("heading", { level: 1, name: "Find a dispute" })).toBeInTheDocument();
    expect(searchCourtLink()).toHaveAttribute("href", "https://court.kleros.io/cases/0?requiredChainId=1");
    // act() in `search` committed any navigation the clear asked for, so the URL read below is final; and past the
    // debounce, nothing has changed.
    debounce.elapse();
    expect(view.currentPath()).toBe("/1/cases/1");
    expect(screen.getByRole("heading", { level: 1, name: "Find a dispute" })).toBeInTheDocument();
    expect(searchField()).toHaveValue("");
  });

  it("P-19: Enter loads the typed ID without waiting for the debounce", async () => {
    programReads({ lookups: { "1": testFoundLookup(), "2": testFoundLookup({ disputeId: 2n }) } });
    renderCase("/1/cases/1");
    await settledDispute();
    await search("2");
    expect(core.lookupDispute).not.toHaveBeenCalledWith(expect.anything(), 2n);
    await interact((user) => user.keyboard("{Enter}"));
    // The debounce is held and never elapses in this test, so only Enter can have started the read.
    await waitFor(() => {
      expect(core.lookupDispute).toHaveBeenCalledWith(expect.anything(), 2n);
    });
  });

  it("spec 5.11: a new dispute starts with the accordion collapsed", async () => {
    programReads({ lookups: { "1": testFoundLookup(), "2": testFoundLookup({ disputeId: 2n }) } });
    renderCase("/1/cases/1");
    await settledDispute();
    await userEvent.setup().click(accordionButton("Question"));
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "true");
    await search("2");
    expect(searchCourtLink()).toHaveAttribute("href", "https://court.kleros.io/cases/2?requiredChainId=1");
    debounce.elapse();
    await settledDispute(2);
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #2" })).toBeInTheDocument();
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "false");
  });
});

describe("section degradation (D-36, S-3, D-18)", () => {
  it("D-36: a failed meta-evidence load degrades the summary and the question, and the rest renders", async () => {
    programReads({ metaEvidence: { "1": { status: "failed", reason: "not-json", error: { code: "invalid-data", message: "The meta-evidence file is not JSON." } } } });
    renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByText("Dispute summary unavailable")).toBeInTheDocument();
    expect(screen.getByText("Question unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("The meta-evidence file is not JSON.")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(timelineColumns().length).toBeGreaterThan(0);
    expect(headerDetail(caseHeader(1), "Court")).toHaveTextContent(/^General Court$/);
  });

  it("S-3: a section that throws degrades alone, and its failure does not carry over to the next dispute", async () => {
    expectRenderErrors();
    breakRealityNotice = true;
    programReads({ lookups: { "1": testFoundLookup(), "2": testFoundLookup({ disputeId: 2n }) } });
    renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByText("Reality notice unavailable")).toBeInTheDocument();
    expect(screen.getByText("The data for this section is malformed and cannot be displayed.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Dispute 1 title" })).toBeInTheDocument();

    breakRealityNotice = false;
    await search("2");
    debounce.elapse();
    // The summary shows once the view settles, which is never before the Reality notice has rendered.
    expect(await screen.findByText("Dispute 2 title")).toBeInTheDocument();
    expect(screen.queryByText("Reality notice unavailable")).not.toBeInTheDocument();
  });

  it("D-18: a meta-evidence naming unconfigured chain 10 degrades only the section that needs that chain", async () => {
    const metaEvidence = testMetaEvidence({ arbitrableChainID: { status: "invalid" }, dynamicScriptURI: "/ipfs/QmQ2XoA25HmnPUEWDduxj6LYwMwp6jtXPFRMHcNF2EvJfU/script.js" });
    const params = actualCore.buildScriptParameters({ metaEvidence, arbitratorChainId: 1, disputeId: 1n, arbitrable: TEST_ARBITRABLE, env: {} });
    if (params.ok) throw new Error("chain 10 must not be accepted as a script parameter");
    programReads({ metaEvidence: { "1": { status: "failed", reason: "unknown-chain", error: params.error } } });
    renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByText("Dispute summary unavailable")).toBeInTheDocument();
    expect(screen.getAllByText(params.error.message).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(timelineColumns().length).toBeGreaterThan(0);
    expect(headerDetail(caseHeader(1), "Number of votes")).toHaveTextContent(/^3$/);
  });

  it("D-18, D-34: an evidence display for chain 10 falls back to the arbitrator chain and the page renders", async () => {
    const metaEvidence = testMetaEvidence({ arbitrableChainID: { status: "invalid" }, evidenceDisplayInterfaceURI: "https://display.example/index.html" });
    programReads({ metaEvidence: { "1": { ...testOkMetaEvidence(), metaEvidence } } });
    renderCase("/1/cases/1");
    await settledDispute();
    const frame = await screen.findByTitle("Evidence display");
    const query = decodeURIComponent(new URL(frame.getAttribute("src") ?? "").search.slice(1));
    expect(JSON.parse(query)).toMatchObject({ arbitrableChainID: 1, arbitratorChainID: 1, chainID: 1 });
    expect(screen.getByRole("heading", { level: 2, name: "Test dispute" })).toBeInTheDocument();
    expect(timelineColumns().length).toBeGreaterThan(0);
  });
});

describe("section Retry (spec 11.3, D-36, S-3)", () => {
  for (const retryCase of RETRY_CASES) {
    const { section, breaks } = retryCase;
    const rows = retryCase.rows ?? (breaks === "throws" ? "11.3, D-36, S-3" : "D-36, S-3");
    const broken = breaks === "throws" ? "a read it could not render" : "a failed read";

    it(`${rows}: Retry on ${section} after ${broken} shows the good read that follows, with no notice left`, async () => {
      await renderBrokenSection(retryCase, 1);

      await pressRetry(section);

      await expectRecovered(retryCase);
      expect(retryCase.reads()).toBe(2);
    });

    it(`${rows}: a Retry on ${section} whose read is still bad degrades it again and keeps offering a Retry that recovers it`, async () => {
      await renderBrokenSection(retryCase, 2);

      await pressRetry(section);

      await waitFor(() => {
        expect(retryCase.reads()).toBe(2);
      });
      expect(await screen.findByText(`${section} unavailable`)).toBeInTheDocument();
      await pressRetry(section);
      await expectRecovered(retryCase);
      expect(retryCase.reads()).toBe(3);
    });
  }

  it("S-3, D-36: while a section's Retry reads again, the other sections keep their content", async () => {
    expectRenderErrors();
    metaEvidenceReads.mockResolvedValueOnce(testOkMetaEvidence({ title: UNRENDERABLE })).mockReturnValueOnce(new Promise<MetaEvidenceResult>(() => undefined));
    renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByText("Dispute summary unavailable")).toBeInTheDocument();

    await pressRetry("Dispute summary");

    await waitFor(() => {
      expect(metaEvidenceReads).toHaveBeenCalledTimes(2);
    });
    expect(headerDetail(caseHeader(1), "Court")).toHaveTextContent(/^General Court$/);
    expect(headerDetail(caseHeader(1), "Number of votes")).toHaveTextContent(/^3$/);
    expect(timelineColumns().length).toBeGreaterThan(0);
    expect(within(accordionBody("Question")).getByText("Multiple choice: single select")).toBeInTheDocument();
  });
});

describe("network change (spec 5.16, D-55)", () => {
  it("D-55: a chain change loads the same ID on the new chain, with nothing of the old one left", async () => {
    programReads({ lookups: { "5": testFoundLookup({ disputeId: 5n }) } });
    const view = renderCase("/1/cases/5", "/100/cases/5");
    await settledDispute(5);
    vi.mocked(core.lookupDispute).mockImplementation(() => new Promise<DisputeLookup>(() => undefined));
    await interact((user) => user.click(screen.getByRole("button", { name: "Go to /100/cases/5" })));
    expect(view.currentPath()).toBe("/100/cases/5");
    expectLoading();
    expect(queryTitle()).not.toBeInTheDocument();
    expect(core.lookupDispute).toHaveBeenLastCalledWith(expect.objectContaining({ chainId: 100 }), 5n);
  });
});
