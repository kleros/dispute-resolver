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
import { HttpRequestError, InvalidInputRpcError, RpcRequestError } from "viem";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import {
  TEST_ARBITRABLE,
  TEST_META_EVIDENCE_URI,
  deferred,
  testCourt,
  testDetails,
  testDisputeEvent,
  testEvidenceList,
  testFamily,
  testFoundLookup,
  testOkMetaEvidence,
} from "../../test/data";
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
    buildDecision: vi.fn(mocked.buildDecision),
    buildAppealPanel: vi.fn(mocked.buildAppealPanel),
  };
});

/** The evidence-display URI whose display the mocked builder cannot build; every other input builds as in production. */
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

const EVIDENCE = testEvidenceList();
const FOUND_EVENT: Outcome<DisputeEventResult> = { ok: true, value: testDisputeEvent() };
const GOVERNOR: FamilyDetection = testFamily({
  family: "governor",
  writeFamily: "governor",
  capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
});
const VIEW_ONLY: FamilyDetection = testFamily({
  family: "view-only",
  writeFamily: "view-only",
  capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } },
});

/** Family detection that fails on the first load, its automatic retry included, and answers the next read when the test resolves it. */
function failFamilyOnFirstLoad() {
  const next = deferred<FamilyDetection>();
  vi.mocked(core.detectFamily).mockRejectedValueOnce(new Error("socket hang up")).mockRejectedValueOnce(new Error("socket hang up")).mockReturnValueOnce(next.promise);
  return next;
}

interface Program {
  readonly period?: Period;
  readonly family?: FamilyDetection;
  /** Lookups by dispute ID; an ID without one is not found. */
  readonly lookups?: Readonly<Record<string, DisputeLookup>>;
  /** Meta-evidence by dispute ID; an ID without one has the test meta-evidence. */
  readonly metaEvidence?: Readonly<Record<string, MetaEvidenceResult | "pending">>;
}

/** Dispute 1 on chain 1 by default, in `period`, every read successful. */
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

function NavigationType() {
  return <p>{`Navigation: ${useNavigationType()}`}</p>;
}

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

function headerDetail(header: HTMLElement, label: string): HTMLElement {
  const index = within(header)
    .getAllByRole("term")
    .findIndex((term) => term.textContent === label);
  const value = within(header).getAllByRole("definition")[index];
  if (index === -1 || value === undefined) throw new Error(`No info row entry labelled ${label}.`);
  return value;
}

function isRecordBand(element: Element): boolean {
  return element.classList.contains("bg-(--dr-record-surface)");
}

function recordBand(element: Element): Element | null {
  let current = element.parentElement;
  while (current !== null && !isRecordBand(current)) current = current.parentElement;
  return current;
}

function queryTitle(): HTMLElement | null {
  return screen.queryByRole("heading", { level: 2, name: /^Dispute \d+ title$/ });
}

function notFoundHeading(id: string): HTMLElement {
  return screen.getByRole("heading", { level: 1, name: `Dispute with ID ${id} does not exist on this network.` });
}

const PAGE_MESSAGE = /^(?:Find a dispute|Dispute with ID .+ does not exist on this network\.|Dispute #\d+ could not be loaded)$/;

function expectLoading(): void {
  expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  expect(screen.queryByRole("heading", { level: 1, name: PAGE_MESSAGE })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Question" })).not.toBeInTheDocument();
}

function timelineColumns(): HTMLElement[] {
  return within(screen.getByRole("region", { name: "Dispute timeline" })).getAllByRole("listitem");
}

function searchField(): HTMLElement {
  return screen.getByRole("searchbox", { name: "Dispute ID" });
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

async function search(text: string) {
  await interact(async (user) => {
    await user.clear(searchField());
    if (text !== "") await user.type(searchField(), text);
  });
}

interface SearchDebounce {
  readonly pending: number;
  /** Lets every waiting debounce elapse now, inside act(), so the load it starts has begun when this returns. */
  elapse(): void;
}

/**
 * Holds the search debounce instead of scheduling it: the hook's `setTimeout(…, SEARCH_DEBOUNCE_MS)` is
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

/** A text React cannot render: a plain object where a string belongs, as a bad dispute's data can hold. */
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

/** The decision core builds, its ruling text unrenderable when it is built from a malformed details read. */
function breakDecisionOnMalformedDetails() {
  vi.mocked(core.buildDecision).mockImplementation((input) => {
    const decision = actualCore.buildDecision(input);
    if (!decision.ok || decision.value.kind !== "jury-decision" || !isMalformed(input.reads?.currentRuling)) return decision;
    return { ok: true, value: { ...decision.value, court: { ...decision.value.court, rulingText: UNRENDERABLE } } };
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
  return { ok: true, value: testEvidenceList(items) };
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
  /** How a bad read breaks it: its render throws and its boundary catches it, or its data is unavailable. */
  readonly breaks: "throws" | "fails";
  /** The accordion item holding the section, opened before Retry; a section above the accordion has none. */
  readonly item?: "Appeal" | "Question" | "Evidence";
  readonly period?: Period;
  /** Programs the read the section's Retry repeats: its first `badReads` answers break the section, later ones are good. */
  readonly program: (badReads: number) => void;
  readonly reads: () => number;
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
    content: () => screen.findByRole("region", { name: "Dispute timeline" }),
  },
  {
    section: "Decision",
    breaks: "throws",
    period: 3,
    ...answers(detailsReads, detailsRead(3, MALFORMED_RULING), detailsRead(3, 1n), breakDecisionOnMalformedDetails),
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

describe("case page states", () => {
  it("the case page without an ID shows the search box and loads no dispute", () => {
    renderCase("/1/cases");
    expect(searchField()).toHaveValue("");
    expect(screen.getByRole("heading", { level: 1, name: "Find a dispute" })).toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("the case page without an ID starts with the search field focused, and a case page leaves focus alone", () => {
    const { unmount } = renderCase("/1/cases");
    expect(searchField()).toHaveFocus();
    unmount();
    renderCase("/1/cases/1");
    expect(searchField()).not.toHaveFocus();
  });

  it("an ID that does not parse is the not-found state, read nowhere and linked nowhere", () => {
    renderCase("/1/cases/abc");
    expect(notFoundHeading("abc")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/1/ongoing");
    expect(document.querySelectorAll("a[href*='abc']")).toHaveLength(0);
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("a dispute the arbitrator does not know shows the not-found state with a link to Ongoing", async () => {
    renderCase("/1/cases/42");
    await waitFor(() => {
      expect(notFoundHeading("42")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "View Ongoing Disputes" })).toHaveAttribute("href", "/1/ongoing");
    expect(screen.queryByRole("heading", { name: "Dispute #42" })).not.toBeInTheDocument();
    expect(Array.from(document.querySelectorAll("[class]")).filter(isRecordBand)).toEqual([]);
    expect(searchField()).toHaveValue("42");
  });

  it("a chain without an arbitrator shows the not-found copy and reads nothing", () => {
    renderCase("/137/cases/5");
    expect(notFoundHeading("5")).toBeInTheDocument();
    expect(screen.getByText(/There is no arbitrator on/)).toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("a lookup that fails in transport is unavailable, not missing, with a Retry that reads it again", async () => {
    vi.mocked(core.lookupDispute).mockRejectedValueOnce(new Error("socket hang up"));
    renderCase("/1/cases/1");
    expect(await screen.findByRole("heading", { level: 1, name: "Dispute #1 could not be loaded" })).toBeInTheDocument();
    expect(screen.queryByText(/does not exist/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry loading dispute 1" }));
    await settledDispute();
    expect(core.lookupDispute).toHaveBeenCalledTimes(2);
  });

  it("a lookup the arbitrator answers as unavailable shows the unavailable state, not 'does not exist'", async () => {
    programReads({ lookups: { "1": { status: "unavailable", error: { code: "rpc-error", message: "The arbitrator did not answer." } } } });
    renderCase("/1/cases/1");
    expect(await screen.findByRole("heading", { level: 1, name: "Dispute #1 could not be loaded" })).toBeInTheDocument();
    expect(screen.getByText("The arbitrator did not answer.")).toBeInTheDocument();
    expect(screen.queryByText(/does not exist/)).not.toBeInTheDocument();
  });

  it("a found dispute shows its header and summary, read for the arbitrator's arbitrable, with no banner or notice", async () => {
    programReads({ period: 2, family: testFamily({ family: "idr-v1" }) });
    renderCase("/1/cases/1");
    const header = await settledDispute();
    expect(within(header).getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(within(header).getByText("Voting")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Dispute 1 title" })).toBeInTheDocument();
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ disputeId: 1n, arbitrable: TEST_ARBITRABLE }));
    expect(screen.queryByText("View mode only for this dispute")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /^The answer options of this question|^Other interfaces may show different answer options|^The question parameters are malformed|^The meta-evidence API pointed to/,
      ),
    ).not.toBeInTheDocument();
  });

  it("keeps the timeline inside the record band, then puts the meta-evidence source warning and the compatibility banner under the band, before the jury decision and the summary", async () => {
    programReads({
      period: 3,
      family: VIEW_ONLY,
      metaEvidence: { "1": { ...testOkMetaEvidence({ title: "Dispute 1 title" }), source: { kind: "event", locator: "disagrees", locatorPath: null } } },
    });
    renderCase("/1/cases/1");
    const warning = await screen.findByText("The meta-evidence API pointed to a file that cannot be verified");
    expect(warning.closest("output")).not.toBeNull();
    const heading = screen.getByRole("heading", { level: 1, name: "Dispute #1" });
    const timeline = await screen.findByRole("region", { name: "Dispute timeline" });
    const decision = await screen.findByRole("heading", { level: 2, name: "Jury decision" });
    const banner = screen.getByText("View mode only for this dispute");
    const title = await screen.findByRole("heading", { level: 2, name: "Dispute 1 title" });
    expect(recordBand(heading)).not.toBeNull();
    expect(recordBand(timeline)).not.toBeNull();
    expect(recordBand(timeline)).toBe(recordBand(heading));
    expect(recordBand(warning)).toBeNull();
    expect(heading.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(timeline.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warning.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.compareDocumentPosition(decision) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(decision.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("while the lookup runs the search box and section placeholders show", () => {
    vi.mocked(core.lookupDispute).mockReturnValue(new Promise<DisputeLookup>(() => undefined));
    renderCase("/1/cases/1");
    expectLoading();
    expect(searchField()).toBeInTheDocument();
    expect(queryTitle()).not.toBeInTheDocument();
  });

  it("renders the header from the lookup while the meta-evidence still loads", async () => {
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

describe("compatibility banner", () => {
  it("a view-only dispute shows the 'View mode only' banner", async () => {
    programReads({ family: GOVERNOR });
    renderCase("/1/cases/1");
    expect(await screen.findByText("View mode only for this dispute")).toBeInTheDocument();
    expect(screen.getByText(/You can't submit evidence or fund appeals on this interface\./)).toBeInTheDocument();
  });

  it("a family that could not be detected is view-only, and the page still renders", async () => {
    vi.mocked(core.detectFamily).mockRejectedValue(new Error("socket hang up"));
    renderCase("/1/cases/1");
    await settledDispute();
    expect(screen.getByText("View mode only for this dispute")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Dispute 1 title" })).toBeInTheDocument();
  });
});

describe("accordion", () => {
  it.each([
    { program: {}, stage: "before the appeal period" },
    { program: { period: 4, family: VIEW_ONLY }, stage: "for a view-only dispute in execution" },
  ] as const)("$stage the accordion holds Question and Evidence with no Appeal item, all collapsed", async ({ program }) => {
    programReads(program);
    renderCase("/1/cases/1");
    await settledDispute();
    expect(screen.queryByRole("button", { name: "Appeal" })).not.toBeInTheDocument();
    for (const name of ["Question", "Evidence"]) {
      expect(accordionButton(name)).toHaveAttribute("aria-expanded", "false");
      expect(accordionBody(name)).not.toBeVisible();
    }
  });

  it("from the appeal period the Appeal panel comes first", async () => {
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

  it("one panel is open at a time, and a collapsed body stays mounted but hidden", async () => {
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

  it("fades an opening body in, fades a collapsing one out before hiding it, and folds the plus into a minus", async () => {
    renderCase("/1/cases/1");
    await settledDispute();
    const user = userEvent.setup();
    const bar = () => accordionButton("Question").querySelector('path[d="M8 2v12"]');
    expect(accordionBody("Question")).toHaveAttribute("data-open", "false");
    expect(bar()).toHaveClass("scale-y-100", "origin-center", "[transform-box:fill-box]", "motion-reduce:transition-none");
    expect(bar()).toHaveAttribute("vector-effect", "non-scaling-stroke");

    await user.click(accordionButton("Question"));
    await waitFor(() => {
      expect(accordionBody("Question")).toBeVisible();
    });
    const body = accordionBody("Question");
    expect(body).toHaveAttribute("data-open", "true");
    expect(body).toHaveClass(
      "animate-[t-acc-in_var(--acc-expand)_var(--acc-ease)_backwards]",
      "data-[open=false]:opacity-0",
      "data-[open=false]:blur-[2px]",
      "motion-reduce:animate-none",
      "motion-reduce:transition-none",
    );
    expect(bar()).toHaveClass("scale-y-0");

    await user.click(accordionButton("Question"));
    expect(body).toHaveAttribute("data-open", "false");
    expect(body).not.toHaveAttribute("hidden");
    expect(bar()).toHaveClass("scale-y-100");
    await waitFor(() => {
      expect(body).not.toBeVisible();
    });
  });

  it("eases the library's height tween on the accordion's curve", async () => {
    renderCase("/1/cases/1");
    await settledDispute();
    const accordion = accordionButton("Question").parentElement?.parentElement;
    expect(accordion).toHaveClass("[&>div>div:last-child]:ease-(--acc-ease)");
  });

  it("keeps an opened item open while the appeal panel settles after the accordion appeared", async () => {
    // The item list is decided from the period and the family alone. If useCaseRefresh("appeal") ever read the family
    // again, the list could change after load, and the library accordion, which tracks the open item by index, would close it.
    programReads({ period: 4, family: VIEW_ONLY });
    const details = deferred<DisputeReads>();
    detailsReads.mockReturnValue(details.promise);
    renderCase("/1/cases/1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Question" }));
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => {
      expect(accordionBody("Question")).toBeVisible();
    });

    await act(() => {
      details.resolve(detailsRead(4, 1n));
      return Promise.resolve();
    });
    await settledDispute();
    await waitFor(() => {
      expect(core.buildAppealPanel).toHaveBeenCalled();
    });

    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "true");
    expect(accordionBody("Question")).toBeVisible();
  });

  it("waits for the family before showing the accordion of a dispute in the appeal period, then fades it in, held still under reduced motion", async () => {
    programReads({ period: 3 });
    const family = deferred<FamilyDetection>();
    vi.mocked(core.detectFamily).mockReturnValue(family.promise);
    renderCase("/1/cases/1");
    await waitFor(() => {
      expect(core.detectFamily).toHaveBeenCalled();
    });
    expect(caseHeader(1)).toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    for (const name of ["Appeal", "Question", "Evidence"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();

    await act(() => {
      family.resolve(testFamily());
      return Promise.resolve();
    });
    await settledDispute();
    const titles = screen.getAllByRole("button", { expanded: false }).map((button) => button.textContent);
    expect(titles.slice(0, 3)).toEqual(["Appeal", "Question", "Evidence"]);
    const accordion = accordionButton("Appeal").parentElement?.parentElement;
    expect(accordion).toHaveClass("animate-[t-reveal-in_var(--reveal-dur)_var(--reveal-ease)_backwards]", "motion-reduce:animate-none");
  });

  it("keeps an Appeal item that says why it is unavailable when the family could not be detected in execution", async () => {
    programReads({ period: 4 });
    vi.mocked(core.detectFamily).mockRejectedValue(new Error("socket hang up"));
    renderCase("/1/cases/1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Appeal" }));
    await waitFor(() => {
      expect(accordionBody("Appeal")).toBeVisible();
    });
    expect(await within(accordionBody("Appeal")).findByText("Appeal unavailable")).toBeInTheDocument();
    expect(within(accordionBody("Appeal")).getByRole("button", { name: "Retry Appeal" })).toBeInTheDocument();
    expect(core.detectFamily).toHaveBeenCalledTimes(2);
  });

  it.each([
    { period: 3, stage: "appeal period", item: "Appeal", retry: "Retry Appeal", unavailable: "Appeal unavailable" },
    { period: 4, stage: "execution period", item: "Appeal", retry: "Retry Appeal", unavailable: "Appeal unavailable" },
    { period: 3, stage: "appeal period", item: "Evidence", retry: "Retry Evidence submission", unavailable: "Evidence submission unavailable" },
  ] as const)("keeps the $item item open while its Retry reads a failed family again in the $stage", async ({ period, item, retry, unavailable }) => {
    programReads({ period });
    const family = failFamilyOnFirstLoad();
    renderCase("/1/cases/1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: item }));
    await user.click(await within(accordionBody(item)).findByRole("button", { name: retry }));
    await waitFor(() => {
      expect(within(accordionBody(item)).queryByText(unavailable)).not.toBeInTheDocument();
    });
    expect(core.detectFamily).toHaveBeenCalledTimes(3);
    expect(accordionButton(item)).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Appeal", "Question", "Evidence"].filter((name) => name !== item)) {
      expect(accordionButton(name)).toHaveAttribute("aria-expanded", "false");
    }

    await act(() => {
      family.resolve(testFamily());
      return Promise.resolve();
    });
    await waitFor(() => {
      expect(core.buildAppealPanel).toHaveBeenCalled();
    });
    expect(accordionButton(item)).toHaveAttribute("aria-expanded", "true");
    expect(accordionBody(item)).toBeVisible();
  });

  it("drops the Appeal item once its Retry finds the arbitrable view-only in execution", async () => {
    programReads({ period: 4 });
    const family = failFamilyOnFirstLoad();
    renderCase("/1/cases/1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Appeal" }));
    await user.click(await within(accordionBody("Appeal")).findByRole("button", { name: "Retry Appeal" }));
    await waitFor(() => {
      expect(core.detectFamily).toHaveBeenCalledTimes(3);
    });

    await act(() => {
      family.resolve(VIEW_ONLY);
      return Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Appeal" })).not.toBeInTheDocument();
    });
    for (const name of ["Question", "Evidence"]) expect(accordionButton(name)).toHaveAttribute("aria-expanded", "false");
  });
});

describe("search box", () => {
  it("an ID above 2^53 keeps every digit in the field and the URL", async () => {
    const view = renderCase("/1/cases/1");
    await settledDispute();
    await search("9007199254740993");
    expect(searchField()).toHaveValue("9007199254740993");
    expect(view.currentPath()).toBe("/1/cases/9007199254740993");
  });

  it("a search clears the shown dispute at once; its first change adds a history entry, later changes replace it, and only the load waits for the debounce", async () => {
    programReads({ lookups: { "1": testFoundLookup(), "34": testFoundLookup({ disputeId: 34n }) } });
    const view = renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByRole("heading", { level: 2, name: "Dispute 1 title" })).toBeInTheDocument();
    await search("3");
    expect(view.currentPath()).toBe("/1/cases/3");
    expect(screen.getByText("Navigation: PUSH")).toBeInTheDocument();
    await interact((user) => user.type(searchField(), "4"));
    expect(searchField()).toHaveValue("34");
    expect(view.currentPath()).toBe("/1/cases/34");
    expect(screen.getByText("Navigation: REPLACE")).toBeInTheDocument();
    expectLoading();
    expect(queryTitle()).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dispute #1" })).not.toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalledWith(expect.anything(), 34n);
    // The second key restarted the debounce: the one the first key started is gone.
    expect(debounce.pending).toBe(1);

    debounce.elapse();
    expect(await screen.findByRole("heading", { level: 2, name: "Dispute 34 title" })).toBeInTheDocument();
    expect(core.lookupDispute).not.toHaveBeenCalledWith(expect.anything(), 3n);
    expect(searchField()).toHaveValue("34");
  });

  it("clearing the search shows no dispute and leaves the URL as it is", async () => {
    const view = renderCase("/1/cases/1");
    await settledDispute();
    await search("");
    expect(screen.getByRole("heading", { level: 1, name: "Find a dispute" })).toBeInTheDocument();
    // act() in `search` committed any navigation the clear asked for, so the URL read below is final; and past the
    // debounce, nothing has changed.
    debounce.elapse();
    expect(view.currentPath()).toBe("/1/cases/1");
    expect(screen.getByRole("heading", { level: 1, name: "Find a dispute" })).toBeInTheDocument();
    expect(searchField()).toHaveValue("");
  });

  it("Enter loads the typed ID without waiting for the debounce", async () => {
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

  it("a new dispute starts with the accordion collapsed", async () => {
    programReads({ lookups: { "1": testFoundLookup(), "2": testFoundLookup({ disputeId: 2n }) } });
    renderCase("/1/cases/1");
    await settledDispute();
    await userEvent.setup().click(accordionButton("Question"));
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "true");
    await search("2");
    debounce.elapse();
    await settledDispute(2);
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #2" })).toBeInTheDocument();
    expect(accordionButton("Question")).toHaveAttribute("aria-expanded", "false");
  });
});

const RECORDED_META_EVIDENCE = {
  title: "Recorded title",
  description: "Recorded in the meta-evidence",
  dynamicScriptURI: "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj",
  arbitrableChainID: 10,
  rulingOptions: { type: "single-select", titles: ["Pay the seller", "Refund the buyer"] },
};

function fetched(body: string): core.FetchResponse {
  return { ok: true, status: 200, json: () => Promise.resolve(JSON.parse(body) as unknown), text: () => Promise.resolve(body) };
}

/**
 * Dispute 1's meta-evidence loaded by core itself: the locator names a file that carries the Create page's allowlisted
 * script and arbitrable chain 10. The runner only counts runs.
 */
async function loadWithUnconfiguredScriptChain() {
  const locator = "https://locator.test/meta-evidence";
  const routes: Readonly<Record<string, string>> = {
    [`${locator}?chainId=1&disputeId=1`]: JSON.stringify({ metaEvidenceUri: TEST_META_EVIDENCE_URI }),
    [`https://cdn.kleros.link${TEST_META_EVIDENCE_URI}`]: JSON.stringify(RECORDED_META_EVIDENCE),
    [`https://cdn.kleros.link${RECORDED_META_EVIDENCE.dynamicScriptURI}`]: "function getMetaEvidence() {}",
  };
  let runs = 0;
  const metaEvidence = await actualCore.loadMetaEvidence({
    arbitratorChainId: 1,
    disputeId: 1n,
    arbitrable: TEST_ARBITRABLE,
    env: { REACT_APP_METAEVIDENCE_URL: locator },
    fetcher: (url) => {
      const body = routes[url];
      return body === undefined ? Promise.reject(new Error("unexpected fetch")) : Promise.resolve(fetched(body));
    },
    runner: {
      run: () => {
        runs += 1;
        return Promise.resolve({ status: "ok", value: { title: "From the script" }, jsonDuplicateKeys: false });
      },
    },
    budgetMs: 1_000,
  });
  return { metaEvidence, scriptRuns: () => runs };
}

describe("section degradation", () => {
  it("a failed meta-evidence load degrades the summary and the question, and the rest renders", async () => {
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

  it("a section that throws degrades alone, and its failure does not carry over to the next dispute", async () => {
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

  it("a meta-evidence whose script names unconfigured chain 10 shows its static summary, its appeal cards and one notice that the script's details are unavailable", async () => {
    const result = await loadWithUnconfiguredScriptChain();
    programReads({ period: 3, metaEvidence: { "1": result.metaEvidence } });
    renderCase("/1/cases/1");
    await settledDispute();
    expect(await screen.findByRole("heading", { level: 2, name: "Recorded title" })).toBeInTheDocument();
    await waitFor(() => {
      expect(labelled(accordionBody("Appeal"), "list", "Rulings to fund")).toBeInTheDocument();
    });
    const cards = labelled(accordionBody("Appeal"), "list", "Rulings to fund");
    expect(within(cards).getByText("Pay the seller")).toBeInTheDocument();
    expect(within(cards).getByText("Refund the buyer")).toBeInTheDocument();
    expect(screen.queryByText("Appeal unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("Dispute summary unavailable")).not.toBeInTheDocument();
    expect(screen.getAllByText("Details from the arbitrable's script are unavailable")).toHaveLength(1);
    expect(result.scriptRuns()).toBe(0);
  });
});

describe("section Retry", () => {
  for (const retryCase of RETRY_CASES) {
    const { section, breaks } = retryCase;
    const broken = breaks === "throws" ? "a read it could not render" : "a failed read";

    it(`Retry on ${section} after ${broken} shows the good read that follows, with no notice left`, async () => {
      await renderBrokenSection(retryCase, 1);

      await pressRetry(section);

      await expectRecovered(retryCase);
      expect(retryCase.reads()).toBe(2);
    });

    it(`a Retry on ${section} after ${broken} whose read is still bad degrades it again and keeps offering a Retry that recovers it`, async () => {
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

  it("while a section's Retry reads again, the other sections keep their content", async () => {
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

describe("network change", () => {
  it("a chain change loads the same ID on the new chain, with nothing of the old one left", async () => {
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

describe("a family read that fails with the read RPC's own error", () => {
  const KEY = "abc123SECRETxyz";
  const KEYED_RPC = `https://rpc.example/v2/${KEY}`;
  const GET_CODE = { method: "eth_getCode", params: ["0x1111111111111111111111111111111111111111", "latest"] };

  it.each([
    ["an HTTP failure", new HttpRequestError({ body: GET_CODE, details: "Too Many Requests", status: 429, url: KEYED_RPC }), "HTTP request failed."],
    [
      "a node error",
      new InvalidInputRpcError(new RpcRequestError({ body: GET_CODE, error: { code: -32000, message: "header not found" }, url: KEYED_RPC })),
      "Missing or invalid parameters.",
    ],
  ])("%s shows its short message in the Evidence submission and Appeal sections, never the RPC's key", async (_, failure, shortMessage) => {
    // Dispute 1 in the appeal period, where both the evidence submission and the appeal need the family.
    programReads({ period: 3 });
    vi.mocked(core.detectFamily).mockRejectedValue(failure);
    renderCase("/1/cases/1");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Evidence" }));
    await waitFor(() => {
      expect(within(accordionBody("Evidence")).getByText("Evidence submission unavailable")).toBeInTheDocument();
    });
    expect(accordionBody("Evidence")).toHaveTextContent(shortMessage);

    await user.click(screen.getByRole("button", { name: "Appeal" }));
    await waitFor(() => {
      expect(within(accordionBody("Appeal")).getByText("Appeal unavailable")).toBeInTheDocument();
    });
    expect(accordionBody("Appeal")).toHaveTextContent(shortMessage);

    expect(document.body.innerHTML.includes(KEY)).toBe(false);
    expect(document.body.innerHTML.includes("rpc.example")).toBe(false);
  });
});
