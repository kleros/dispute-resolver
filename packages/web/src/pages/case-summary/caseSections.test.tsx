import {
  NONE_OF_THE_OPTIONS_TEXT,
  REFUSED_RULING_TEXT,
  REGISTRY,
  buildDecision,
  buildDisputeView,
  describeAppealRules,
  type Address,
  type AppealPanel,
  type Court,
  type DisputeReads,
  type ExecutedRuling,
  type FamilyDetection,
  type FundingTerms,
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
import { renderWithProviders } from "../../test/shell";
import { installOfflineAppKitEnvironment } from "../../test/wallet";
import { AppealSection } from "../case-appeal";
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
  readonly appealPanel?: SectionData<AppealPanel>;
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
    appealPanel: options.appealPanel ?? sectionLoading,
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
      { name: "Voting", state: "current", text: "Voting01d 23h 00m" },
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
    expect(list.className).not.toMatch(/small[^\s]*\]:animate-/);
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
    expect(within(timeline()).getAllByText("01d 23h 00m")).toHaveLength(1);
    expect(timelineList().querySelectorAll('li[aria-current="step"] small')).toHaveLength(1);
    expect(countdown(timelineList())).toHaveTextContent("01d 23h 00m");
  });

  it("shows every step's state as visible text", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    const list = timelineList();
    expect(within(list).getByText("Concluded")).toBeInTheDocument();
    expect(within(list).getByText("01d 00h 00m")).toBeInTheDocument();
    expect(countdown(list)).toBeVisible();
    expect(list.querySelectorAll('[class*="sr-only"]')).toHaveLength(0);
  });

  it("tells screen readers that the current step's value is the time left in its period", () => {
    const { unmount } = renderSection(DisputeTimeline, caseDispute({ period: 2, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    const hint = within(timeline()).getByText(/time left in its period/);
    expect(hint).toHaveClass("sr-only");
    expect(hint).not.toHaveAttribute("aria-live");
    expect(timelineList()).not.toContainElement(hint);
    unmount();
    renderSection(DisputeTimeline, caseDispute({ period: 4 }));
    expect(within(timeline()).queryByText(/time left in its period/)).not.toBeInTheDocument();
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
      ["Evidence", "Evidence00d 23h 00m"],
      ["Voting", "Voting02d 06h 00m"],
      ["Appeal", "Appeal01d 00h 00m"],
      ["Execution", "Execution"],
    ]);
    expect(within(timelineList()).queryByText(/Lasts/)).not.toBeInTheDocument();
  });

  it("reads Unknown when the current deadline is not a finite time", () => {
    const dispute = caseDispute({ period: 2 });
    const view = dispute.view.status === "ready" && dispute.view.value.exists ? dispute.view.value : undefined;
    if (view?.timeline.ok !== true) throw new Error("The test dispute has no timeline.");
    const withEndlessDeadline = view.timeline.value.columns.map((column) => (column.state === "current" ? { ...column, deadline: Number.POSITIVE_INFINITY } : column));
    renderSection(DisputeTimeline, { ...dispute, view: sectionReady({ ...view, timeline: { ok: true, value: { columns: withEndlessDeadline } } }) });
    expect(columns()[1]).toEqual({ name: "Voting", state: "current", text: "VotingUnknown" });
  });

  it.each([
    ["vertical", false],
    ["horizontal", true],
  ] as const)("sets the countdown alone on its line at 16 px semibold in tabular figures (%s)", (_orientation, horizontal) => {
    if (horizontal) {
      installOfflineAppKitEnvironment();
      vi.stubGlobal("matchMedia", matchEverything);
    }
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    const list = timelineList();
    const value = "[&_li[aria-current]_small]";
    expect(list).toHaveClass(`${value}:text-base`, `${value}:font-semibold`, `${value}:text-klerosUIComponentsPrimaryText`, `${value}:tabular-nums`);
    expect(list.className).not.toContain("text-xl");
    // As block boxes, the library's flex columns set the states as lines of text, so the countdown sits on the line the title's block gives it.
    expect(list).toHaveClass(horizontal ? "[&>li>div:last-child]:block" : "[&_li>div:last-child>div]:block");
    const states = Array.from(within(list).getByRole("listitem", { name: "Voting" }).querySelectorAll("small"), (small) => small.textContent);
    expect(states).toEqual([expect.stringMatching(COUNTDOWN)]);
    expect(Array.from(list.querySelectorAll("li[aria-current] small"), (small) => small.textContent)).toEqual(states);
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

describe("DisputeTimeline in the appeal period", () => {
  /** Two days of appeal period, an hour in: it ends in 01d 23h 00m. */
  const APPEAL_COURT: Partial<Court> = { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), 2n * BigInt(DAY)] };
  const END = NOW - HOUR + 2 * DAY;
  const LOSING = NOW - HOUR + DAY;
  const TERMS: FundingTerms = { noun: "answer", tie: null, appealPeriodEnd: END, loserDeadline: LOSING };
  const ONE_TIME = ["01d 23h 00m"];
  const WINNING_SIDE = "The winning side has until the period ends.";
  const AHEAD = { variant: "warning", title: "Losing side: 00d\u00a023h\u00a000m left to fund an appeal", body: WINNING_SIDE };
  const PASSED = { variant: "warning", title: "Losing side: deadline passed", body: WINNING_SIDE };
  const UNKNOWN = { variant: "info", title: "Losing side: deadline unknown", body: "The losing side may have less time to fund an appeal than the full period." };

  function crowdfunding(terms: FundingTerms): SectionData<AppealPanel> {
    return sectionReady({ kind: "crowdfunding", dialect: "idr", terms, cards: [], freeInput: null, composer: null });
  }

  function appealCase(appealPanel: SectionData<AppealPanel>, lastPeriodChange = NOW - HOUR): CaseDispute {
    return caseDispute({ period: 3, lastPeriodChange, court: APPEAL_COURT, appealPanel });
  }

  /** The current step's state lines, one entry per subitem the library renders. */
  function currentLines(): string[] {
    const current = timelineList().querySelector('li[aria-current="step"]');
    if (current === null) throw new Error("No current step.");
    return Array.from(current.querySelectorAll("small"), (small) => small.textContent);
  }

  /** The titles of the alerts in the timeline's section outside its list of steps. */
  function noticeTitles(): HTMLElement[] {
    const list = timelineList();
    return Array.from(timeline().querySelectorAll("h2")).filter((title) => !list.contains(title));
  }

  /** The notice under the steps, by the colour its title takes from the library's variant. */
  function losingNotice(): { variant: string; title: string; body: string } | null {
    const titles = noticeTitles();
    expect(titles.length).toBeLessThanOrEqual(1);
    const title = titles[0];
    if (title === undefined) return null;
    let variant = "other";
    if (title.classList.contains("text-klerosUIComponentsWarning")) variant = "warning";
    else if (title.classList.contains("text-klerosUIComponentsPrimaryBlue")) variant = "info";
    return { variant, title: title.textContent, body: title.nextElementSibling?.textContent ?? "" };
  }

  function withColumns(dispute: CaseDispute, deadline: number | null): CaseDispute {
    const view = dispute.view.status === "ready" && dispute.view.value.exists ? dispute.view.value : undefined;
    if (view?.timeline.ok !== true) throw new Error("The test dispute has no timeline.");
    const columns = view.timeline.value.columns.map((column) => (column.state === "current" ? { ...column, deadline } : column));
    return { ...dispute, view: sectionReady({ ...view, timeline: { ok: true, value: { columns } } }) };
  }

  function rowLayout(): void {
    installOfflineAppKitEnvironment();
    vi.stubGlobal("matchMedia", matchEverything);
  }

  it("keeps the appeal step to its countdown and tells, under the steps, when funding for the losing side closes", () => {
    renderSection(DisputeTimeline, appealCase(crowdfunding(TERMS)));
    expect(currentLines()).toEqual(ONE_TIME);
    expect(losingNotice()).toEqual(AHEAD);
  });

  it("says the losing side's deadline passed once its time passed", () => {
    renderSection(DisputeTimeline, appealCase(crowdfunding({ ...TERMS, loserDeadline: NOW })));
    expect(currentLines()).toEqual(ONE_TIME);
    expect(losingNotice()).toEqual(PASSED);
  });

  it("counts the losing side's last second down before it says the deadline passed", () => {
    renderSection(DisputeTimeline, appealCase(crowdfunding({ ...TERMS, loserDeadline: NOW + 1 })));
    expect(losingNotice()?.title).toBe("Losing side: 00d\u00a000h\u00a000m left to fund an appeal");
  });

  it("turns the losing side's countdown into deadline passed when its time passes while the page is open", () => {
    renderSection(DisputeTimeline, appealCase(crowdfunding({ ...TERMS, loserDeadline: NOW + 60 })));
    expect(losingNotice()?.title).toBe("Losing side: 00d\u00a000h\u00a001m left to fund an appeal");
    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(currentLines()).toEqual(["01d 22h 59m"]);
    expect(losingNotice()).toEqual(PASSED);
  });

  it("keeps the losing side's countdown in one piece", () => {
    renderSection(DisputeTimeline, appealCase(crowdfunding(TERMS)));
    expect(losingNotice()?.title).toMatch(/^Losing side: \d{2}d\u00a0\d{2}h\u00a0\d{2}m left to fund an appeal$/);
  });

  it.each<[string, SectionData<AppealPanel>]>([
    ["the losing side's time", crowdfunding({ ...TERMS, appealPeriodEnd: NOW, loserDeadline: NOW - DAY })],
    ["an unknown losing side's time", sectionReady({ kind: "funding-unsupported" })],
  ])("says Ended alone and drops the notice of %s once the appeal period's time passed", (_case, appealPanel) => {
    renderSection(DisputeTimeline, appealCase(appealPanel, NOW - 2 * DAY));
    expect(currentLines()).toEqual(["Ended"]);
    expect(losingNotice()).toBeNull();
  });

  it("keeps the notice through the appeal period's last second", () => {
    renderSection(DisputeTimeline, appealCase(crowdfunding({ ...TERMS, appealPeriodEnd: NOW + 1, loserDeadline: NOW - DAY }), NOW + 1 - 2 * DAY));
    expect(currentLines()).toEqual(["00d 00h 00m"]);
    expect(losingNotice()).toEqual(PASSED);
  });

  it("drops the notice when the appeal period's time passes while the page is open", () => {
    renderSection(DisputeTimeline, appealCase(crowdfunding({ ...TERMS, appealPeriodEnd: NOW + 60, loserDeadline: NOW - DAY }), NOW + 60 - 2 * DAY));
    expect(losingNotice()).toEqual(PASSED);
    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(currentLines()).toEqual(["Ended"]);
    expect(losingNotice()).toBeNull();
  });

  it.each(["answer", "list"] as const)("calls the losing side the same whatever the dispute calls its rulings (%s)", (noun) => {
    const { unmount } = renderSection(DisputeTimeline, appealCase(crowdfunding({ ...TERMS, noun })));
    expect(losingNotice()).toEqual(AHEAD);
    unmount();
    renderSection(DisputeTimeline, appealCase(crowdfunding({ ...TERMS, noun, loserDeadline: NOW })));
    expect(losingNotice()).toEqual(PASSED);
  });

  it("tells the losing side's time for a tie where refusing to arbitrate is the winner", () => {
    renderSection(DisputeTimeline, appealCase(crowdfunding({ ...TERMS, tie: "refuse-is-winner" })));
    expect(currentLines()).toEqual(ONE_TIME);
    expect(losingNotice()).toEqual(AHEAD);
  });

  it.each([
    ["a tie that shares the whole period", { ...TERMS, tie: "shared-full-period" }],
    ["a tie that costs every answer as a winner", { ...TERMS, tie: "all-winner" }],
    ["losing answers closing at the appeal period's end", { ...TERMS, loserDeadline: END }],
    ["losing answers closing after the appeal period's end", { ...TERMS, loserDeadline: END + HOUR }],
  ] as const)("shows no notice for %s", (_case, terms: FundingTerms) => {
    renderSection(DisputeTimeline, appealCase(crowdfunding(terms)));
    expect(currentLines()).toEqual(ONE_TIME);
    expect(losingNotice()).toBeNull();
  });

  it("tells the losing side's time for a product appealed in its own application whose funding times are known", () => {
    renderSection(DisputeTimeline, appealCase(sectionReady({ kind: "handled-by-arbitrable", terms: TERMS })));
    expect(currentLines()).toEqual(ONE_TIME);
    expect(losingNotice()).toEqual(AHEAD);
  });

  it.each<[string, SectionData<AppealPanel>]>([
    ["an arbitrable that takes appeals in its own application without known times", sectionReady({ kind: "handled-by-arbitrable" })],
    ["an arbitrable whose funding rules are not supported", sectionReady({ kind: "funding-unsupported" })],
    ["appeal fees that could not be calculated", sectionReady({ kind: "fees-unavailable", error: { code: "rpc-error", message: "The fees could not be read." } })],
  ])("says the losing side's deadline is unknown for %s", (_case, appealPanel) => {
    renderSection(DisputeTimeline, appealCase(appealPanel));
    expect(currentLines()).toEqual(ONE_TIME);
    expect(losingNotice()).toEqual(UNKNOWN);
  });

  it.each<[string, SectionData<AppealPanel>]>([
    ["an escrow appeal", sectionReady({ kind: "escrow-appeal", appealCost: 1n, deadline: END })],
    ["an escrow appeal that ended", sectionReady({ kind: "escrow-ended" })],
    ["an arbitrable that cannot be appealed", sectionReady({ kind: "not-appealable" })],
    ["a hidden appeal", sectionReady({ kind: "hidden" })],
    ["withdrawals", sectionReady({ kind: "withdraw", state: { status: "nothing" }, noun: "answer" })],
    ["withdrawals this app does not support", sectionReady({ kind: "withdraw-unsupported" })],
    ["an appeal read still loading", sectionLoading],
    ["an appeal read that failed", sectionUnavailable("rpc-error", "The appeal could not be read.")],
  ])("shows only when the appeal period ends, with no notice, for %s", (_case, appealPanel) => {
    renderSection(DisputeTimeline, appealCase(appealPanel));
    expect(currentLines()).toEqual(ONE_TIME);
    expect(losingNotice()).toBeNull();
    expect(screen.queryByText("Timeline unavailable")).not.toBeInTheDocument();
  });

  it("adds the notice under the steps when the appeal read lands, leaving the steps as they were", () => {
    const { rerender } = renderSection(DisputeTimeline, appealCase(sectionLoading));
    expect(losingNotice()).toBeNull();
    const list = timelineList();
    const classes = list.className;
    const countdown = within(list).getByText("01d 23h 00m");
    rerender(
      <TestDataProvider>
        <SectionBoundary section="Section">
          <DisputeTimeline dispute={appealCase(crowdfunding(TERMS))} chain={MAINNET} />
        </SectionBoundary>
      </TestDataProvider>,
    );
    expect(losingNotice()).toEqual(AHEAD);
    expect(timelineList()).toBe(list);
    expect(list.className).toBe(classes);
    expect(currentLines()).toEqual(ONE_TIME);
    expect(within(list).getByText("01d 23h 00m")).toBe(countdown);
  });

  it.each([
    ["vertical", false],
    ["horizontal", true],
  ] as const)("puts the notice after the list of steps, inside the timeline's section (%s)", (_orientation, horizontal) => {
    if (horizontal) rowLayout();
    renderSection(DisputeTimeline, appealCase(crowdfunding(TERMS)));
    const list = timelineList();
    const [title] = noticeTitles();
    if (title === undefined) throw new Error("No notice.");
    expect(timeline()).toContainElement(title);
    expect(list).not.toContainElement(title);
    expect(list.nextElementSibling).toContainElement(title);
  });

  it.each<[string, SectionData<AppealPanel>]>([
    ["warning", crowdfunding(TERMS)],
    ["info", sectionReady({ kind: "funding-unsupported" })],
  ])("never announces the %s notice as it changes: no live region and no alert", (_variant, appealPanel) => {
    renderSection(DisputeTimeline, appealCase(appealPanel));
    expect(noticeTitles()).toHaveLength(1);
    expect(timeline().querySelector("[aria-live]")).toBeNull();
    expect(within(timeline()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the appeal step's state and the notice when the appeal period's time is not a finite one", () => {
    renderSection(DisputeTimeline, withColumns(appealCase(crowdfunding(TERMS)), Number.POSITIVE_INFINITY));
    expect(currentLines()).toEqual(["Unknown"]);
    expect(losingNotice()).toEqual(AHEAD);
  });

  it("gives a current step without a deadline no state lines and no notice, even with the appeal's times known", () => {
    renderSection(DisputeTimeline, withColumns(appealCase(crowdfunding(TERMS)), null));
    expect(timelineList().querySelectorAll('li[aria-current="step"] small')).toHaveLength(0);
    expect(losingNotice()).toBeNull();
  });

  it.each([
    ["Evidence", { period: 0, lastPeriodChange: NOW - 3 * DAY, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }],
    ["Commit", { period: 1, lastPeriodChange: NOW - DAY, court: { hiddenVotes: true, timesPerPeriod: [3n * BigInt(DAY), BigInt(DAY), 2n * BigInt(DAY), BigInt(DAY)] } }],
    ["Voting", { period: 2, lastPeriodChange: NOW - 2 * DAY, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }],
  ] as const)("says Ended on the %s step once its time passed", (name, options: CaseOptions) => {
    renderSection(DisputeTimeline, caseDispute(options));
    expect(timelineList().querySelector('li[aria-current="step"]')).toHaveAttribute("aria-label", name);
    expect(currentLines()).toEqual(["Ended"]);
  });

  it("counts a step's last second down before it says Ended", () => {
    renderSection(
      DisputeTimeline,
      caseDispute({ period: 2, lastPeriodChange: NOW + 1 - 2 * DAY, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }),
    );
    expect(currentLines()).toEqual(["00d 00h 00m"]);
  });

  it.each([
    ["the evidence period", 0],
    ["the voting period", 2],
    ["the execution period", 4],
  ] as const)("shows no notice in %s, even with the appeal's times known", (_case, period) => {
    renderSection(DisputeTimeline, caseDispute({ period, appealPanel: crowdfunding(TERMS) }));
    expect(losingNotice()).toBeNull();
  });

  it.each([
    ["two times", { ...TERMS, tie: null }],
    ["a tie where refusing to arbitrate is the winner", { ...TERMS, tie: "refuse-is-winner" }],
    ["a tie that shares the whole period", { ...TERMS, tie: "shared-full-period" }],
    ["a tie that costs every answer as a winner", { ...TERMS, tie: "all-winner" }],
    ["losing answers closing at the appeal period's end", { ...TERMS, loserDeadline: END }],
  ] as const)("the appeal notice and the timeline agree on whether the losing side's funding closes first (%s)", (_case, terms: FundingTerms) => {
    const dispute = appealCase(sectionReady({ kind: "handled-by-arbitrable", terms }));
    renderWithProviders(
      <>
        <DisputeTimeline dispute={dispute} chain={MAINNET} />
        <AppealSection dispute={dispute} chain={MAINNET} />
      </>,
    );
    const noticeHasTwo = screen.getByText(/Funding for/).textContent.includes("every other answer");
    expect(losingNotice()?.variant === "warning").toBe(noticeHasTwo);
  });

  it("gives a lone Ended the value style, the slot a countdown fills", () => {
    renderSection(DisputeTimeline, appealCase(crowdfunding(TERMS), NOW - 2 * DAY));
    const list = timelineList();
    const value = "[&_li[aria-current]_small]";
    expect(list).toHaveClass(`${value}:text-base`, `${value}:leading-5`, `${value}:font-semibold`, `${value}:text-klerosUIComponentsPrimaryText`, `${value}:tabular-nums`);
    expect(Array.from(list.querySelectorAll("li[aria-current] small"), (small) => small.textContent)).toEqual(["Ended"]);
  });

  it.each<[string, CaseDispute, boolean]>([
    ["with a notice, in the row", appealCase(crowdfunding(TERMS)), true],
    ["with a notice, in the list", appealCase(crowdfunding(TERMS)), false],
    ["while the appeal read loads, in the row", appealCase(sectionLoading), true],
    ["once it says Ended, in the row", appealCase(crowdfunding(TERMS), NOW - 2 * DAY), true],
  ])("lays the steps out as in every other period (%s)", (_case, dispute, horizontal) => {
    if (horizontal) rowLayout();
    renderSection(DisputeTimeline, dispute);
    const list = timelineList();
    if (horizontal) expect(list).toHaveClass("pb-14");
    expect(list.className.split(/\s+/).filter((token) => /pb-19|leading-5\.5|mb-px|before:|nth-of-type|:has\(|grid|col-span/.test(token))).toEqual([]);
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
      `Won by default: “No” was the only answer fully funded for the appeal. The court ruled “${REFUSED_RULING_TEXT}”.`,
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
      "Won by default: “No” was the only answer fully funded for the appeal. The court ruled “Yes”.",
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
      "The arbitrable contract reported a ruling that is not one of this dispute's answers.",
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

  const COLOURS = sectionReady(testOkMetaEvidence({ rulingOptions: { type: "multiple-select", titles: ["Red", "Green", "Blue"] } }));
  it.each([
    ["as the court's ruling in the appeal period", { period: 3, family: testFamily(), details: { currentRuling: yes } }, "Jury decision", APPEALABLE],
    [
      "as the only answer fully funded, winning by default",
      { period: 4, ruled: true, details: { currentRuling: { ok: true, value: 0n } }, executed: { status: "executed", ruling: 1n }, fundedRulings: funded(1n) },
      "Winner",
      `Won by default: “${NONE_OF_THE_OPTIONS_TEXT}” was the only answer fully funded for the appeal. The court ruled “${REFUSED_RULING_TEXT}”.`,
    ],
    [
      "as the ruling the arbitrable applied instead of the court's",
      { period: 4, ruled: true, details: { currentRuling: { ok: true, value: 2n } }, executed: { status: "executed", ruling: 1n }, fundedRulings: funded(1n, 2n) },
      "Winner",
      `The court ruled “Red”. The arbitrable contract applied “${NONE_OF_THE_OPTIONS_TEXT}”.`,
    ],
  ] as const)("ruling 1 of a multiple-select, no option ticked, reads None of the options %s", (_case, options: CaseOptions, title, line) => {
    renderSection(DecisionAlert, caseDispute({ family: VIEW_ONLY, metaEvidence: COLOURS, ...options }));
    expect(decisionAlert(title).textContent).toBe(`${title}${NONE_OF_THE_OPTIONS_TEXT}${line}`);
  });

  const UNTITLED = sectionReady(testOkMetaEvidence({ rulingOptions: { type: "multiple-select" } }));
  it.each([
    ["in the appeal period", { period: 3, family: testFamily(), details: { currentRuling: yes } }, "Jury decision", APPEALABLE],
    [
      "won by default",
      { period: 4, ruled: true, details: { currentRuling: yes }, executed: { status: "executed", ruling: 2n }, fundedRulings: funded(2n) },
      "Winner",
      "Won by default as the only answer fully funded for the appeal.",
    ],
    [
      "applied by the arbitrable",
      { period: 4, ruled: true, details: { currentRuling: yes }, executed: { status: "executed", ruling: 2n }, fundedRulings: funded(1n, 2n) },
      "Winner",
      "The arbitrable contract applied a ruling other than the court's.",
    ],
  ] as const)("a ruling that reads as nothing shows no ruling line and no empty quotes, %s", (_case, options: CaseOptions, title, line) => {
    renderSection(DecisionAlert, caseDispute({ family: VIEW_ONLY, metaEvidence: UNTITLED, ...options }));
    const alert = decisionAlert(title);
    expect(alert.textContent).toBe(`${title}${line}`);
    expect(alert.textContent).not.toContain("“”");
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
