import {
  REFUSED_RULING_TEXT,
  buildDisputeView,
  type Court,
  type DisputeReads,
  type MetaEvidenceResult,
  type Outcome,
  type Period,
  type RealityQuestionInfo,
} from "@dispute-resolver/core";
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LG_MEDIA_QUERY, SectionBoundary } from "../../ui";
import type { CaseDispute, SectionData } from "../../data";
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
  readonly fundedRulings?: Outcome<readonly bigint[]> | null;
  readonly metaEvidence?: SectionData<MetaEvidenceResult>;
  readonly view?: "ready" | "loading";
}

/** A mainnet dispute whose view core builds from the given reads, as `useCase` does. */
function caseDispute(options: CaseOptions = {}): CaseDispute {
  const base = testFoundLookup({ period: options.period ?? 0 });
  const lookup = { ...base, dispute: { ...base.dispute, lastPeriodChange: options.lastPeriodChange ?? NOW - HOUR } };
  const metaEvidence = options.metaEvidence ?? sectionReady(testOkMetaEvidence());
  const family = testFamily();
  const view = buildDisputeView({
    lookup,
    reads: testDetails(lookup, options.details),
    family: { ok: true, value: family },
    courts: options.courts ?? { ok: true, value: [testCourt(options.court)] },
    metaEvidence: metaEvidence.status === "ready" ? metaEvidence.value : null,
    fundedRulings: options.fundedRulings ?? null,
  });
  return testCaseDispute({
    lookup: sectionReady(lookup),
    view: options.view === "loading" ? sectionLoading : sectionReady(view),
    family: sectionReady(family),
    metaEvidence,
    courts: sectionReady([testCourt(options.court)]),
  });
}

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

/** A step as the reader perceives it: its name, whether it is concluded, the current step or upcoming, and its text. */
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

/** A `matchMedia` for a viewport every query matches, so the timeline lays out as from lg. */
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

  it("the header card draws no tinted band of its own", () => {
    const { container } = renderSection(CaseOverview, caseDispute({ period: 2 }));
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    const tinted = Array.from(container.querySelectorAll("[class]")).filter((element) => element.classList.contains("bg-(--dr-record-surface)"));
    expect(tinted).toEqual([]);
  });
});

describe("DisputeTimeline", () => {
  const COUNTDOWN = /^\d{2}d \d{2}h \d{2}m$/;

  it("counts the current step down, marks past steps concluded and gives upcoming steps their duration", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2, lastPeriodChange: NOW - HOUR, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    expect(columns()).toEqual([
      { name: "Evidence", state: "concluded", text: expect.stringContaining("Concluded") as string },
      { name: "Voting", state: "current", text: expect.stringContaining("Ends in 01d 23h 00m") as string },
      { name: "Appeal", state: "upcoming", text: expect.stringContaining("01d 00h 00m") as string },
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
    const before = within(list).getByText(COUNTDOWN);
    expect(before).toHaveTextContent("00d 23h 59m");
    act(() => {
      vi.advanceTimersByTime(30 * 1000);
    });
    expect(within(list).getByText(COUNTDOWN)).toBe(before);
    act(() => {
      vi.advanceTimersByTime(30 * 1000);
    });
    expect(before).not.toBeInTheDocument();
    expect(within(list).getByText(COUNTDOWN)).toHaveTextContent("00d 23h 58m");
  });

  it.each([
    ["vertical", false],
    ["horizontal", true],
  ] as const)("eases the steps' colours over the shared tab timing and snaps them under reduced motion (%s)", (_orientation, horizontal) => {
    if (horizontal) {
      installOfflineAppKitEnvironment();
      vi.stubGlobal("matchMedia", matchEverything);
    }
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    const list = timelineList();
    for (const target of ["[&_[aria-hidden]>*]", "[&_[aria-hidden]_span]", "[&_h2]"]) {
      expect(list).toHaveClass(`${target}:transition-colors`, `${target}:duration-(--tabs-dur)`, `${target}:ease-(--tabs-ease)`, `${target}:motion-reduce:transition-none`);
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
    expect(within(timeline()).getAllByText(COUNTDOWN)).toHaveLength(1);
    expect(within(timeline()).getAllByText(/^Ends in/)).toHaveLength(1);
  });

  it("shows every step's state as visible text", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    const list = timelineList();
    expect(within(list).getByText("Concluded")).toBeInTheDocument();
    expect(within(list).getByText("Lasts 01d 00h 00m")).toBeInTheDocument();
    expect(within(list).getByText("Ends in")).toBeInTheDocument();
    expect(within(list).getByText(COUNTDOWN)).toBeInTheDocument();
    expect(list.querySelectorAll('[class*="sr-only"]')).toHaveLength(0);
  });

  it("lifts only the current name one size below lg", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    const names = steps().map((step) => within(step).getByRole("heading", { level: 2 }));
    expect(names.map((name) => name.textContent)).toEqual(["Evidence", "Voting", "Appeal", "Execution"]);
    expect(steps().map((step) => step.getAttribute("aria-current"))).toEqual([null, "step", null, null]);
    expect(timelineList()).toHaveClass("[&_li[aria-current]_h2]:text-base");
  });

  it("renders the vertical steps where the browser has no media queries", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    const list = timelineList();
    expect(list).toHaveAccessibleName("Vertical progress steps");
    expect(list).toHaveClass("[&_[aria-hidden]>*+*]:min-h-6", "[&_div>li>div:last-child]:pb-4");
    expect(list).not.toHaveClass("w-full");
  });

  it("renders the horizontal steps when the lg query matches", () => {
    installOfflineAppKitEnvironment();
    vi.stubGlobal("matchMedia", matchEverything);
    renderSection(DisputeTimeline, caseDispute({ period: 2, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    const list = timelineList();
    expect(list).toHaveAccessibleName("Horizontal progress steps");
    expect(list.querySelectorAll(":scope > li")).toHaveLength(4);
    expect(list).toHaveClass("w-full");
    expect(list.className).not.toContain("min-h-6");
    expect(list.className).not.toContain("pb-4");
    expect(within(list).getAllByText(COUNTDOWN)).toHaveLength(1);
  });

  it("keeps five steps vertical until the wide query matches", () => {
    installOfflineAppKitEnvironment();
    vi.stubGlobal("matchMedia", matchOnly([LG_MEDIA_QUERY]));
    renderSection(DisputeTimeline, caseDispute({ period: 1, court: { hiddenVotes: true } }));
    expect(timelineList()).toHaveAccessibleName("Vertical progress steps");
    expect(steps()).toHaveLength(5);
  });

  it("lays four steps out in a row as soon as the lg query matches", () => {
    installOfflineAppKitEnvironment();
    vi.stubGlobal("matchMedia", matchOnly([LG_MEDIA_QUERY]));
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    expect(timelineList()).toHaveAccessibleName("Horizontal progress steps");
    expect(steps()).toHaveLength(4);
  });

  it("lays five steps out in a row once the wide query matches", () => {
    installOfflineAppKitEnvironment();
    vi.stubGlobal("matchMedia", matchOnly([LG_MEDIA_QUERY, FIVE_STEPS_MEDIA_QUERY]));
    renderSection(DisputeTimeline, caseDispute({ period: 1, court: { hiddenVotes: true } }));
    expect(timelineList()).toHaveAccessibleName("Horizontal progress steps");
    expect(steps()).toHaveLength(5);
  });

  it("names the timeline from outside the library list", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    expect(within(timeline()).getAllByRole("list")).toHaveLength(1);
  });

  it("shows no state text for the execution step", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 4 }));
    const execution = within(timelineList()).getByRole("listitem", { name: "Execution" });
    expect(execution).toHaveAttribute("aria-current", "step");
    expect(execution.querySelector("small")).toBeNull();
  });

  it("draws the upcoming bullet ring with the band's edge", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    expect(timelineList()).toHaveClass("[&_li[aria-disabled]_[aria-hidden]>div:first-child]:border-(--dr-record-edge)");
    expect(steps().map((step) => step.getAttribute("aria-disabled"))).toEqual([null, null, "true", "true"]);
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

  it("shows a timeline that was ready on the first render without motion", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    expect(timeline().parentElement?.className).not.toContain("t-reveal-in");
  });

  it("fades the decision in when it arrives after its placeholder, but not when it was ready at once", () => {
    renderThenSettle(DecisionAlert, caseDispute({ period: 3, view: "loading" }), caseDispute({ period: 3 }));
    expect(decisionAlert("Jury decision")).toHaveClass(REVEAL, "motion-reduce:animate-none");
  });

  it("shows a decision that was ready on the first render without motion", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3 }));
    expect(decisionAlert("Jury decision").className).not.toContain("t-reveal-in");
  });

  it("fades in each info value that arrives after its placeholder", () => {
    renderThenSettle(CaseOverview, caseDispute({ period: 2, view: "loading" }), caseDispute({ period: 2 }));
    for (const label of ["Court", "Number of votes"]) {
      const value = detail(label).firstElementChild;
      expect(value).toHaveClass(REVEAL, "motion-reduce:animate-none");
    }
  });

  it("shows info values that were ready on the first render without motion", () => {
    renderSection(CaseOverview, caseDispute({ period: 2 }));
    for (const label of ["Court", "Number of votes"]) {
      expect(detail(label).innerHTML).not.toContain("t-reveal-in");
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

  it("in the appeal period shows the jury decision and that it can be appealed", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { currentRuling: { ok: true, value: 1n } } }));
    expect(screen.getByRole("heading", { name: "Jury decision" })).toBeInTheDocument();
    expect(within(decisionAlert("Jury decision")).getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText(/can be appealed within the appeal period/)).toBeInTheDocument();
    expect(screen.queryByText(/arbitrable application/)).not.toBeInTheDocument();
  });

  it("a view-only dispute points to the arbitrable application to appeal", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { localId: { kind: "unresolved", reason: "reverted" } } }));
    expect(screen.getByText(/Go to the arbitrable application to appeal this ruling/)).toBeInTheDocument();
  });

  it("ruling 0 reads as refused to arbitrate", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { currentRuling: { ok: true, value: 0n } } }));
    expect(within(decisionAlert("Jury decision")).getByText(REFUSED_RULING_TEXT)).toBeInTheDocument();
  });

  it("in execution the single funded ruling wins by default", () => {
    renderSection(DecisionAlert, caseDispute({ period: 4, details: { currentRuling: { ok: true, value: 1n } }, fundedRulings: { ok: true, value: [2n] } }));
    expect(screen.getByRole("heading", { name: "Winner" })).toBeInTheDocument();
    expect(within(decisionAlert("Winner")).getByText("No")).toBeInTheDocument();
    expect(within(decisionAlert("Winner")).getByText("Won by default")).toBeInTheDocument();
  });

  it("in execution without a single funded ruling the jury decision wins", () => {
    renderSection(DecisionAlert, caseDispute({ period: 4, details: { currentRuling: { ok: true, value: 1n } }, fundedRulings: { ok: true, value: [1n, 2n] } }));
    expect(screen.getByRole("heading", { name: "Winner" })).toBeInTheDocument();
    expect(within(decisionAlert("Winner")).getByText("Yes")).toBeInTheDocument();
    expect(within(decisionAlert("Winner")).getByText("Won by jury decision")).toBeInTheDocument();
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

  it("holds a placeholder in the appeal period until the view settles, and nothing before it", () => {
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
