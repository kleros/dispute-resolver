import {
  REFUSED_RULING_TEXT,
  REGISTRY,
  buildDecision,
  buildDisputeView,
  describeAppealRules,
  type Address,
  type Court,
  type DisputeReads,
  type ExecutedRuling,
  type FamilyDetection,
  type MetaEvidenceResult,
  type Outcome,
  type Period,
  type RealityQuestionInfo,
} from "@dispute-resolver/core";
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LG_MEDIA_QUERY, SectionBoundary } from "../../ui";
import { fromOutcome, type CaseDispute, type SectionData } from "../../data";
import {
  TestDataProvider,
  sectionLoading,
  sectionReady,
  sectionUnavailable,
  testCaseDispute,
  testChain,
  testCourt,
  testDetails,
  testFamily,
  testFoundLookup,
  testOkMetaEvidence,
} from "../../test/data";
import { matchOnly } from "../../test/matchMedia";
import { installOfflineAppKitEnvironment } from "../../test/wallet";
import { FIVE_STEPS_MEDIA_QUERY } from "./DisputeTimeline";
import { CaseOverview, DecisionAlert, DisputeTimeline, RealityNotice } from "./index";

const NOW = 1_700_000_000;
const DAY = 86_400;
const HOUR = 3_600;

const MAINNET = testChain(1);

interface CaseOptions {
  readonly period?: Period;
  readonly lastPeriodChange?: number;
  readonly court?: Partial<Court>;
  readonly courts?: Outcome<readonly Court[]>;
  readonly details?: Partial<DisputeReads>;
  readonly family?: FamilyDetection;
  readonly ruled?: boolean;
  /** What the arbitrable reports it executed; by default nothing was read. */
  readonly executed?: ExecutedRuling | null;
  readonly fundedRulings?: Outcome<readonly bigint[]> | null;
  readonly metaEvidence?: SectionData<MetaEvidenceResult>;
  readonly view?: "ready" | "loading";
}

/** A mainnet dispute whose view and decision core builds from the given reads, as `useCase` does. */
function caseDispute(options: CaseOptions = {}): CaseDispute {
  const base = testFoundLookup({ period: options.period ?? 0, ruled: options.ruled ?? false });
  const lookup = { ...base, dispute: { ...base.dispute, lastPeriodChange: options.lastPeriodChange ?? NOW - HOUR } };
  const metaEvidence = options.metaEvidence ?? sectionReady(testOkMetaEvidence());
  const family = options.family ?? testFamily();
  const reads = testDetails(lookup, options.details);
  const metaEvidenceResult = metaEvidence.status === "ready" ? metaEvidence.value : null;
  const view = buildDisputeView({
    lookup,
    reads,
    family: { ok: true, value: family },
    courts: options.courts ?? { ok: true, value: [testCourt(options.court)] },
    metaEvidence: metaEvidenceResult,
  });
  const decision = buildDecision({
    dispute: lookup.dispute,
    reads,
    rules: describeAppealRules(REGISTRY, family),
    executed: options.executed ?? null,
    fundedRulings: options.fundedRulings ?? null,
    metaEvidence: metaEvidenceResult,
  });
  const loading = options.view === "loading";
  return testCaseDispute({
    lookup: sectionReady(lookup),
    view: loading ? sectionLoading : sectionReady(view),
    decision: loading ? sectionLoading : fromOutcome(decision),
    family: sectionReady(family),
    metaEvidence,
    courts: sectionReady([testCourt(options.court)]),
  });
}

const VIEW_ONLY = testFamily({
  family: "view-only",
  writeFamily: "view-only",
  capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } },
});
const OLD_REALITY_PROXY: Address = "0x126697b552b83f08c7ebebae8d13eae2871e4e1e";
/** One of the 0.4.24 Reality proxies, whose code has no appeal function. */
const NOT_APPEALABLE = testFamily({
  arbitrable: OLD_REALITY_PROXY,
  family: "reality-proxy",
  writeFamily: "view-only",
  capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } },
  realityProxy: REGISTRY.realityProxies[`1:${OLD_REALITY_PROXY}`] ?? null,
});

type Section = typeof CaseOverview;

function renderSection(Component: Section, dispute: CaseDispute) {
  return render(
    <TestDataProvider>
      <SectionBoundary section="Section">
        <Component dispute={dispute} chain={MAINNET} />
      </SectionBoundary>
    </TestDataProvider>,
  );
}

/** The section a reader hears as "Dispute timeline"; the library names its list by orientation only. */
function timeline(): HTMLElement {
  return screen.getByRole("region", { name: "Dispute timeline" });
}

function timelineList(): HTMLElement {
  return within(timeline()).getByRole("list");
}

function steps(): HTMLElement[] {
  return within(timelineList()).getAllByRole("listitem");
}

function columns(): { name: string | null; state: string; text: string }[] {
  return steps().map((step) => {
    let state = "concluded";
    if (step.getAttribute("aria-current") === "step") state = "current";
    else if (step.getAttribute("aria-disabled") === "true") state = "upcoming";
    const text = Array.from(step.querySelectorAll("h2, small"), (element) => element.textContent).join("");
    return { name: step.getAttribute("aria-label"), state, text };
  });
}

function detail(label: string): HTMLElement {
  const index = screen.getAllByRole("term").findIndex((term) => term.textContent === label);
  const value = screen.getAllByRole("definition")[index];
  if (index === -1 || value === undefined) throw new Error(`No info row entry labelled ${label}.`);
  return value;
}

function matchEverything(query: string): MediaQueryList {
  return matchOnly([query])(query);
}

function decisionAlert(name: "Jury decision" | "Winner"): HTMLElement {
  return screen.getByRole("region", { name });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW * 1000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CaseOverview", () => {
  it("shows the dispute ID, the network, the number of votes and the court", () => {
    renderSection(CaseOverview, caseDispute({ period: 2, court: { name: "Blockchain Court" }, details: { votesLengths: { ok: true, value: [5n, 11n] } } }));
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(screen.getByText(MAINNET.name)).toBeInTheDocument();
    expect(detail("Number of votes")).toHaveTextContent(/^5$/);
    expect(detail("Court")).toHaveTextContent(/^Blockchain Court$/);
    expect(screen.getByText("Voting")).toBeInTheDocument();
  });

  it("shows the period from the lookup while the view is still loading", () => {
    renderSection(CaseOverview, caseDispute({ period: 3, view: "loading" }));
    expect(screen.getByText("Appeal")).toBeInTheDocument();
    expect(within(detail("Number of votes")).getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(detail("Number of votes")).not.toHaveTextContent(/\d/);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("a missing vote count degrades the votes only", () => {
    renderSection(CaseOverview, caseDispute({ details: { votesLengths: { ok: true, value: [] } } }));
    expect(detail("Number of votes")).toHaveTextContent(/^Unavailable: .*no valid vote count/);
    expect(detail("Court")).toHaveTextContent(/^General Court$/);
  });

  it("a court whose policy failed to load shows its ID instead of a name", () => {
    renderSection(CaseOverview, caseDispute({ court: { id: 0n, name: null } }));
    expect(detail("Court")).toHaveTextContent(/^Court #0 \(name unavailable\)$/);
  });

  it("a court missing from the list shows the court as unavailable", () => {
    renderSection(CaseOverview, caseDispute({ courts: { ok: true, value: [] } }));
    expect(screen.getByText(/Court 0 is not in the court list/)).toBeInTheDocument();
    expect(detail("Number of votes")).toHaveTextContent(/^3$/);
  });

  it("renders nothing for a lookup that found no dispute", () => {
    const dispute = caseDispute();
    const { container } = renderSection(CaseOverview, { ...dispute, view: sectionReady({ exists: false, reason: "not-found" }) });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DisputeTimeline", () => {
  const COUNTDOWN = /^\d{2}d \d{2}h \d{2}m$/;

  function countdown(list: HTMLElement): HTMLElement {
    const current = list.querySelector<HTMLElement>('li[aria-current="step"]');
    if (current === null) throw new Error("No current step.");
    return within(current).getByText(COUNTDOWN);
  }

  it("counts the current step down, marks past steps concluded and gives upcoming steps their duration", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2, lastPeriodChange: NOW - HOUR, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    expect(columns()).toEqual([
      { name: "Evidence", state: "concluded", text: expect.stringContaining("Concluded") as string },
      { name: "Voting", state: "current", text: expect.stringContaining("Ends in 01d 23h 00m") as string },
      { name: "Appeal", state: "upcoming", text: "Appeal01d 00h 00m" },
      { name: "Execution", state: "upcoming", text: "Execution" },
    ]);
    expect(steps()[1]).toHaveAttribute("aria-current", "step");
  });

  it("advances the countdown on the shared clock", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 0, lastPeriodChange: NOW, court: { timesPerPeriod: [BigInt(DAY), 0n, BigInt(DAY), BigInt(DAY)] } }));
    expect(columns()[0]?.text).toContain("01d 00h 00m");
    act(() => {
      vi.advanceTimersByTime(HOUR * 1000);
    });
    expect(columns()[0]?.text).toContain("00d 23h 00m");
  });

  it("shows each new minute of the countdown without an entrance animation", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 0, lastPeriodChange: NOW, court: { timesPerPeriod: [BigInt(DAY), 0n, BigInt(DAY), BigInt(DAY)] } }));
    const list = timelineList();
    expect(list.className).not.toMatch(/small\+small\]:animate-/);
    act(() => {
      vi.advanceTimersByTime(30 * 1000);
    });
    const before = countdown(list);
    expect(before).toHaveTextContent("00d 23h 59m");
    act(() => {
      vi.advanceTimersByTime(30 * 1000);
    });
    expect(countdown(list)).toBe(before);
    act(() => {
      vi.advanceTimersByTime(30 * 1000);
    });
    expect(before).not.toBeInTheDocument();
    expect(countdown(list)).toHaveTextContent("00d 23h 58m");
  });

  it.each([
    ["vertical", false],
    ["horizontal", true],
  ] as const)("eases the steps' colours and the current halo over the shared tab timing and snaps them under reduced motion (%s)", (_orientation, horizontal) => {
    if (horizontal) {
      installOfflineAppKitEnvironment();
      vi.stubGlobal("matchMedia", matchEverything);
    }
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    const list = timelineList();
    expect(list).toHaveClass("[&_[aria-hidden]>*]:transition-[color,background-color,border-color,fill,box-shadow]");
    for (const target of ["[&_[aria-hidden]_span]", "[&_h2]"]) {
      expect(list).toHaveClass(`${target}:transition-colors`);
    }
    for (const target of ["[&_[aria-hidden]>*]", "[&_[aria-hidden]_span]", "[&_h2]"]) {
      expect(list).toHaveClass(`${target}:duration-(--tabs-dur)`, `${target}:ease-(--tabs-ease)`, `${target}:motion-reduce:transition-none`);
    }
    expect(list.className).not.toContain("duration-200");
    if (horizontal) {
      expect(list).toHaveClass(
        "[&_li]:after:transition-colors",
        "[&_li]:after:duration-(--tabs-dur)",
        "[&_li]:after:ease-(--tabs-ease)",
        "[&_li]:after:motion-reduce:transition-none",
      );
    }
  });

  it("shows the commit step for a hidden-vote court", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 1, court: { hiddenVotes: true } }));
    expect(columns().map(({ name, state }) => [name, state])).toEqual([
      ["Evidence", "concluded"],
      ["Commit", "current"],
      ["Voting", "upcoming"],
      ["Appeal", "upcoming"],
      ["Execution", "upcoming"],
    ]);
  });

  it("in the execution period marks every earlier step concluded and execution current", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 4 }));
    expect(columns().map(({ name, state }) => [name, state])).toEqual([
      ["Evidence", "concluded"],
      ["Voting", "concluded"],
      ["Appeal", "concluded"],
      ["Execution", "current"],
    ]);
    const execution = within(timelineList()).getByRole("listitem", { name: "Execution" });
    expect(execution).toHaveAttribute("aria-current", "step");
    expect(execution.querySelector("small")).toBeNull();
  });

  it("degrades only the timeline when the court is missing from the list", () => {
    const dispute = caseDispute({ period: 3, courts: { ok: true, value: [] } });
    render(
      <TestDataProvider>
        <DisputeTimeline dispute={dispute} chain={MAINNET} />
        <DecisionAlert dispute={dispute} chain={MAINNET} />
      </TestDataProvider>,
    );
    expect(screen.getByText("Timeline unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Dispute timeline" })).not.toBeInTheDocument();
    expect(decisionAlert("Jury decision")).toBeInTheDocument();
  });

  it("shows a loading placeholder until the view settles", () => {
    renderSection(DisputeTimeline, caseDispute({ view: "loading" }));
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("renders the current countdown once", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    expect(within(timeline()).getAllByRole("list")).toHaveLength(1);
    expect(within(timeline()).getAllByText(/^Ends in/)).toHaveLength(1);
    expect(countdown(timelineList())).toHaveTextContent("01d 23h 00m");
  });

  it("shows every step's state as visible text", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    const list = timelineList();
    expect(within(list).getByText("Concluded")).toBeInTheDocument();
    expect(within(list).getByText("01d 00h 00m")).toBeInTheDocument();
    expect(within(list).getByText("Ends in")).toBeInTheDocument();
    expect(countdown(list)).toBeVisible();
    expect(list.querySelectorAll('[class*="sr-only"]')).toHaveLength(0);
  });

  it.each([
    { label: "five steps, lg query only", queries: [LG_MEDIA_QUERY], hiddenVotes: true, orientation: "Vertical", steps: 5 },
    { label: "four steps, lg query only", queries: [LG_MEDIA_QUERY], hiddenVotes: false, orientation: "Horizontal", steps: 4 },
    { label: "five steps, lg and five-step queries", queries: [LG_MEDIA_QUERY, FIVE_STEPS_MEDIA_QUERY], hiddenVotes: true, orientation: "Horizontal", steps: 5 },
    { label: "four steps, five-step query only", queries: [FIVE_STEPS_MEDIA_QUERY], hiddenVotes: false, orientation: "Vertical", steps: 4 },
    { label: "four steps, no media queries", queries: null, hiddenVotes: false, orientation: "Vertical", steps: 4 },
  ])("lays the steps out as $orientation progress steps ($label)", ({ queries, hiddenVotes, orientation, steps: count }) => {
    if (queries !== null) {
      installOfflineAppKitEnvironment();
      vi.stubGlobal("matchMedia", matchOnly(queries));
    }
    renderSection(DisputeTimeline, caseDispute(hiddenVotes ? { period: 1, court: { hiddenVotes: true } } : { period: 2 }));
    expect(timelineList()).toHaveAccessibleName(`${orientation} progress steps`);
    expect(steps()).toHaveLength(count);
  });

  it("gives an upcoming period its duration alone, with no word before it", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 0, court: { timesPerPeriod: [BigInt(DAY), 0n, 2n * BigInt(DAY) + 6n * BigInt(HOUR), BigInt(DAY)] } }));
    expect(columns().map(({ name, text }) => [name, text])).toEqual([
      ["Evidence", "EvidenceEnds in 00d 23h 00m"],
      ["Voting", "Voting02d 06h 00m"],
      ["Appeal", "Appeal01d 00h 00m"],
      ["Execution", "Execution"],
    ]);
    expect(within(timelineList()).queryByText(/Lasts/)).not.toBeInTheDocument();
  });

  it("reads Unknown after Ends in when the current deadline is not a finite time", () => {
    const dispute = caseDispute({ period: 2 });
    const view = dispute.view.status === "ready" && dispute.view.value.exists ? dispute.view.value : undefined;
    if (view?.timeline.ok !== true) throw new Error("The test dispute has no timeline.");
    const withEndlessDeadline = view.timeline.value.columns.map((column) => (column.state === "current" ? { ...column, deadline: Number.POSITIVE_INFINITY } : column));
    renderSection(DisputeTimeline, { ...dispute, view: sectionReady({ ...view, timeline: { ok: true, value: { columns: withEndlessDeadline } } }) });
    expect(columns()[1]).toEqual({ name: "Voting", state: "current", text: "VotingEnds in Unknown" });
  });

  it.each([
    ["vertical", false],
    ["horizontal", true],
  ] as const)("sets the countdown on the line of Ends in at 16 px semibold in tabular figures (%s)", (_orientation, horizontal) => {
    if (horizontal) {
      installOfflineAppKitEnvironment();
      vi.stubGlobal("matchMedia", matchEverything);
    }
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    const list = timelineList();
    const countdown = "[&_li[aria-current]_small+small]";
    expect(list).toHaveClass(`${countdown}:text-base`, `${countdown}:font-semibold`, `${countdown}:text-klerosUIComponentsPrimaryText`, `${countdown}:tabular-nums`);
    expect(list.className).not.toContain("text-xl");
    // As block boxes, the library's flex columns let "Ends in" and the countdown run inline on one line.
    expect(list).toHaveClass(horizontal ? "[&>li>div:last-child]:block" : "[&_li>div:last-child>div]:block");
    const [endsIn, value] = Array.from(within(list).getByRole("listitem", { name: "Voting" }).querySelectorAll("small"));
    expect(endsIn?.textContent).toBe("Ends in ");
    expect(endsIn?.nextElementSibling).toBe(value);
  });

  it.each([
    ["vertical", false],
    ["horizontal", true],
  ] as const)("changes only colours between a concluded, the current and an upcoming step's connector, so its thickness eases with its colour (%s)", (_orientation, horizontal) => {
    if (horizontal) {
      installOfflineAppKitEnvironment();
      vi.stubGlobal("matchMedia", matchEverything);
    }
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    const byState = timelineList()
      .className.split(/\s+/)
      .filter((token) => /aria-(current|disabled)/.test(token));
    expect(byState.filter((token) => /:(after:)?(border-[tblr](-\d+)?|m[xytblr]?-[^:]+)$/.test(token))).toEqual([]);
  });
});

describe("content replacing its placeholder", () => {
  const REVEAL = "animate-[t-reveal-in_var(--reveal-dur)_var(--reveal-ease)_backwards]";

  function renderThenSettle(Component: Section, loading: CaseDispute, ready: CaseDispute) {
    const { rerender } = renderSection(Component, loading);
    rerender(
      <TestDataProvider>
        <SectionBoundary section="Section">
          <Component dispute={ready} chain={MAINNET} />
        </SectionBoundary>
      </TestDataProvider>,
    );
  }

  it("fades the timeline in when it arrives after its placeholder, and holds it still under reduced motion", () => {
    renderThenSettle(DisputeTimeline, caseDispute({ period: 2, view: "loading" }), caseDispute({ period: 2 }));
    const content = timeline().parentElement;
    expect(content).toHaveClass(REVEAL, "motion-reduce:animate-none");
  });

  it("fades the decision in when it arrives after its placeholder", () => {
    renderThenSettle(DecisionAlert, caseDispute({ period: 3, view: "loading" }), caseDispute({ period: 3 }));
    expect(decisionAlert("Jury decision")).toHaveClass(REVEAL, "motion-reduce:animate-none");
  });

  it("fades in each info value that arrives after its placeholder", () => {
    renderThenSettle(CaseOverview, caseDispute({ period: 2, view: "loading" }), caseDispute({ period: 2 }));
    for (const label of ["Court", "Number of votes"]) {
      const value = detail(label).firstElementChild;
      expect(value).toHaveClass(REVEAL, "motion-reduce:animate-none");
    }
  });

  it("fades the period pill in when the lookup finds the dispute after its placeholder", () => {
    const ready = caseDispute({ period: 2 });
    renderThenSettle(CaseOverview, { ...ready, lookup: sectionLoading }, ready);
    expect(screen.getByText("Voting").closest("span")).toHaveClass(REVEAL, "motion-reduce:animate-none");
  });
});

describe("DecisionAlert", () => {
  it.each([0, 1, 2] as const)("shows no decision in period %i", (period) => {
    const { container } = renderSection(DecisionAlert, caseDispute({ period }));
    expect(container).toBeEmptyDOMElement();
  });

  const APPEALABLE = "This decision can be appealed within the appeal period.";
  const yes = { ok: true, value: 1n } as const;
  const funded = (...rulings: bigint[]): Outcome<readonly bigint[]> => ({ ok: true, value: rulings });
  it.each([
    ["in the appeal period", { period: 3, family: testFamily() }, "Jury decision", "Yes", APPEALABLE],
    [
      "in the appeal period of an arbitrable that appeals in its own application",
      { period: 3, family: VIEW_ONLY },
      "Jury decision",
      "Yes",
      `${APPEALABLE} Go to the arbitrable application to appeal this ruling.`,
    ],
    ["in the appeal period of an arbitrable without an appeal", { period: 3, family: NOT_APPEALABLE }, "Jury decision", "Yes", "This dispute cannot be appealed."],
    ["before the arbitrator executed the ruling", { period: 4, fundedRulings: funded(2n) }, "Jury decision", "Yes", "The ruling has not been executed yet."],
    ["when the arbitrable applied the court's ruling", { period: 4, ruled: true, executed: { status: "executed", ruling: 1n } }, "Winner", "Yes", "Won by jury decision."],
    [
      "when the arbitrable applied the only ruling fully funded for the appeal",
      { period: 4, ruled: true, details: { currentRuling: { ok: true, value: 0n } }, executed: { status: "executed", ruling: 2n }, fundedRulings: funded(2n) },
      "Winner",
      "No",
      `Won by default: “No” was the only option fully funded for the appeal. The court ruled “${REFUSED_RULING_TEXT}”.`,
    ],
    [
      "when the arbitrable applied another ruling than the court's without that proof",
      { period: 4, ruled: true, executed: { status: "executed", ruling: 2n }, fundedRulings: funded(1n, 2n) },
      "Winner",
      "No",
      "The court ruled “Yes”. The arbitrable contract applied “No”.",
    ],
    [
      "when the arbitrable reported no ruling and only another ruling was fully funded",
      { period: 4, ruled: true, executed: { status: "none-reported" }, fundedRulings: funded(2n) },
      "Winner",
      "No",
      "Won by default: “No” was the only option fully funded for the appeal. The court ruled “Yes”.",
    ],
    [
      "when the arbitrable's report and the funding could not be read",
      {
        period: 4,
        ruled: true,
        executed: { status: "unread", error: { code: "rpc-error", message: "logs refused" } },
        fundedRulings: { ok: false, error: { code: "not-found", message: "No proof." } },
      },
      "Winner",
      "Yes",
      "Won by jury decision.",
    ],
    [
      "when the arbitrable reported a ruling that is not an option",
      { period: 4, ruled: true, executed: { status: "out-of-range", ruling: 5n } },
      "Jury decision",
      "Yes",
      "The arbitrable contract reported a ruling that is not one of this dispute's options.",
    ],
    [
      "when the arbitrable reported several rulings",
      { period: 4, ruled: true, executed: { status: "inconsistent" } },
      "Jury decision",
      "Yes",
      "The arbitrable contract reported conflicting rulings.",
    ],
  ] as const)("%s, the decision shows its title, the ruling and one line, with nothing to press", (_case, options: CaseOptions, title, ruling, line) => {
    renderSection(DecisionAlert, caseDispute({ family: VIEW_ONLY, details: { currentRuling: yes }, ...options }));
    const alert = decisionAlert(title);
    expect(within(alert).getByText(ruling, { exact: true })).toBeInTheDocument();
    expect(alert.textContent).toBe(`${title}${ruling}${line}`);
    expect(within(alert).queryByRole("button")).not.toBeInTheDocument();
  });

  it("ruling 0 reads as refused to arbitrate", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { currentRuling: { ok: true, value: 0n } } }));
    expect(within(decisionAlert("Jury decision")).getByText(REFUSED_RULING_TEXT)).toBeInTheDocument();
  });

  it("the decision alert names a title-less single-select ruling by its number", () => {
    const metaEvidence = sectionReady(testOkMetaEvidence({ rulingOptions: { type: "single-select" } }));
    renderSection(DecisionAlert, caseDispute({ period: 3, metaEvidence, details: { currentRuling: { ok: true, value: 2n } } }));
    expect(within(decisionAlert("Jury decision")).getByText("2")).toBeInTheDocument();
  });

  it("a failed current-ruling read shows the decision as unavailable", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { currentRuling: { ok: false, error: { code: "rpc-error", message: "currentRuling could not be read." } } } }));
    expect(screen.getByText("Decision unavailable")).toBeInTheDocument();
    expect(screen.getByText("currentRuling could not be read.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^(?:Jury decision|Winner)$/ })).not.toBeInTheDocument();
  });

  it("a failed decision degrades alone while the timeline stays", () => {
    const dispute = caseDispute({ period: 3, details: { currentRuling: { ok: false, error: { code: "rpc-error", message: "currentRuling could not be read." } } } });
    render(
      <TestDataProvider>
        <DisputeTimeline dispute={dispute} chain={MAINNET} />
        <DecisionAlert dispute={dispute} chain={MAINNET} />
      </TestDataProvider>,
    );
    expect(screen.getByText("Decision unavailable")).toBeInTheDocument();
    expect(timeline()).toBeInTheDocument();
  });

  it("holds a placeholder in the appeal period until the decision settles, and nothing before it", () => {
    const { unmount } = renderSection(DecisionAlert, caseDispute({ period: 3, view: "loading" }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    unmount();
    const { container } = renderSection(DecisionAlert, caseDispute({ period: 0, view: "loading" }));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RealityNotice", () => {
  function withQuestion(realityQuestion: RealityQuestionInfo | null): CaseDispute {
    return caseDispute({ metaEvidence: sectionReady(testOkMetaEvidence({ realityQuestion })) });
  }

  it.each<[RealityQuestionInfo, string, string]>([
    [{ status: "unresolvable", divergent: true }, "The answer options of this question could not be determined", "alert"],
    [{ status: "unverified", divergent: true }, "The answer options of this question could not be verified", ""],
    [{ status: "malformed", divergent: true }, "Other interfaces may show different answer options for this question", ""],
    [{ status: "malformed" }, "The question parameters are malformed", ""],
  ])("picks the notice by its fixed priority (%o)", (question, title, role) => {
    const { container } = renderSection(RealityNotice, withQuestion(question));
    const notice = container.firstElementChild;
    expect(notice).toHaveTextContent(title);
    expect(notice?.getAttribute("role") ?? "").toBe(role);
  });

  it("appends the question recorded on-chain with its line breaks", () => {
    const { container } = renderSection(RealityNotice, withQuestion({ status: "unverified", title: "Will it rain?\nAnswer by noon." }));
    const notice = container.firstElementChild;
    expect(notice?.textContent).toContain("Question recorded on-chain: Will it rain?\nAnswer by noon.");
    expect(notice).toHaveClass("whitespace-pre-line");
  });

  it("adds no on-chain question line for an empty question title", () => {
    const { container } = renderSection(RealityNotice, withQuestion({ status: "malformed", title: "" }));
    expect(container).toHaveTextContent("The question parameters are malformed");
    expect(container.textContent).not.toContain("Question recorded on-chain:");
  });

  it("shows no notice for a verified question, without a Reality question, or before the meta-evidence loads", () => {
    const { container, unmount } = renderSection(RealityNotice, withQuestion({ status: "verified", divergent: false }));
    expect(container).toBeEmptyDOMElement();
    unmount();
    const second = renderSection(RealityNotice, withQuestion(null));
    expect(second.container).toBeEmptyDOMElement();
    second.unmount();
    const third = renderSection(RealityNotice, caseDispute({ metaEvidence: sectionLoading }));
    expect(third.container).toBeEmptyDOMElement();
    third.unmount();
    const fourth = renderSection(RealityNotice, caseDispute({ metaEvidence: sectionUnavailable("rpc-error") }));
    expect(fourth.container).toBeEmptyDOMElement();
  });
});
