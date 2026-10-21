import {
  REFUSED_RULING_TEXT,
  buildDisputeView,
  getChain,
  type ChainConfig,
  type Court,
  type DisputeReads,
  type MetaEvidenceResult,
  type Outcome,
  type Period,
  type RealityQuestionInfo,
} from "@dispute-resolver/core";
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionBoundary } from "../../ui";
import type { CaseDispute, SectionData } from "../../data";
import { TestDataProvider, sectionLoading, sectionReady, sectionUnavailable, testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence } from "../../test/data";
import { CaseOverview, DecisionAlert, DisputeTimeline, RealityNotice } from "./index";

const NOW = 1_700_000_000;
const DAY = 86_400;
const HOUR = 3_600;

function mainnet(): ChainConfig {
  const chain = getChain(1);
  if (chain === undefined) throw new Error("mainnet is not configured");
  return chain;
}

const MAINNET = mainnet();

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
  return {
    status: "dispute",
    chainId: 1,
    disputeId: 1n,
    lookup: sectionReady(lookup),
    view: options.view === "loading" ? sectionLoading : sectionReady(view),
    family: sectionReady(family),
    metaEvidence,
    disputeEvent: sectionLoading,
    evidence: sectionLoading,
    appealDecisions: sectionLoading,
    courts: sectionReady([testCourt(options.court)]),
    appealPanel: sectionLoading,
    write: sectionLoading,
  };
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

/** The labels the timeline gives its columns, as a reader sees them. */
const COLUMN_NAMES = ["Evidence", "Commit", "Voting", "Appeal", "Execution"] as const;

/** A column as the reader perceives it: its label, whether it is the current step, concluded or upcoming, and its text. */
function columns(): { name: string | undefined; state: string; text: string }[] {
  return within(screen.getByRole("list", { name: "Dispute timeline" }))
    .getAllByRole("listitem")
    .map((column) => {
      const text = column.textContent;
      let state = "upcoming";
      if (column.getAttribute("aria-current") === "step") state = "current";
      else if (text.includes("Concluded")) state = "concluded";
      return { name: COLUMN_NAMES.find((name) => text.startsWith(name)), state, text };
    });
}

/** The value of one entry of the info row, found by its visible label. */
function detail(label: string): HTMLElement {
  const index = screen.getAllByRole("term").findIndex((term) => term.textContent === label);
  const value = screen.getAllByRole("definition")[index];
  if (index === -1 || value === undefined) throw new Error(`No info row entry labelled ${label}.`);
  return value;
}

/** The timeline's steps, in order. */
function steps(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "Dispute timeline" })).getAllByRole("listitem");
}

/** The two halves of a step's rail, the line arriving at its bullet and the line leaving it. */
function railHalves(step: HTMLElement): Element[] {
  const rail = step.querySelector('[aria-hidden="true"]');
  if (rail === null) throw new Error("The step has no rail.");
  return Array.from(rail.children).filter((child) => child.classList.contains("h-px"));
}

/** The element wrapping the text `text` as the step shows it. */
function stepDetail(text: string): HTMLElement {
  const element = screen.getByText(text).parentElement;
  if (element === null) throw new Error(`No detail for ${text}.`);
  return element;
}

/** The decision alert, a region named after its heading. */
function decisionAlert(name: "Jury decision" | "Winner"): HTMLElement {
  return screen.getByRole("region", { name });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW * 1000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CaseOverview", () => {
  it("spec 5.8: shows the dispute ID, the network, the number of votes and the court", () => {
    renderSection(CaseOverview, caseDispute({ period: 2, court: { name: "Blockchain Court" }, details: { votesLengths: { ok: true, value: [5n, 11n] } } }));
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    expect(screen.getByText(MAINNET.name)).toBeInTheDocument();
    expect(detail("Number of votes")).toHaveTextContent(/^5$/);
    expect(detail("Court")).toHaveTextContent(/^Blockchain Court$/);
    expect(screen.getByText("Voting")).toBeInTheDocument();
  });

  it("P-20: shows the period from the lookup while the view is still loading", () => {
    renderSection(CaseOverview, caseDispute({ period: 3, view: "loading" }));
    expect(screen.getByText("Appeal")).toBeInTheDocument();
    expect(within(detail("Number of votes")).getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(detail("Number of votes")).not.toHaveTextContent(/\d/);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("D-36: a missing vote count degrades the votes only", () => {
    renderSection(CaseOverview, caseDispute({ details: { votesLengths: { ok: true, value: [] } } }));
    expect(detail("Number of votes")).toHaveTextContent(/^Unavailable: .*no valid vote count/);
    expect(detail("Court")).toHaveTextContent(/^General Court$/);
  });

  it("D-19: a court whose policy failed to load shows its ID instead of a name", () => {
    renderSection(CaseOverview, caseDispute({ court: { id: 0n, name: null } }));
    expect(detail("Court")).toHaveTextContent(/^Court #0 \(name unavailable\)$/);
  });

  it("D-36: a court missing from the list shows the court as unavailable", () => {
    renderSection(CaseOverview, caseDispute({ courts: { ok: true, value: [] } }));
    expect(screen.getByText(/Court 0 is not in the court list/)).toBeInTheDocument();
    expect(detail("Number of votes")).toHaveTextContent(/^3$/);
  });

  it("D-53: renders nothing for a lookup that found no dispute", () => {
    const dispute = caseDispute();
    const { container } = renderSection(CaseOverview, { ...dispute, view: sectionReady({ exists: false, reason: "not-found" }) });
    expect(container).toBeEmptyDOMElement();
  });

  it("the header card no longer draws its own band", () => {
    const { container } = renderSection(CaseOverview, caseDispute({ period: 2 }));
    expect(screen.getByRole("heading", { level: 1, name: "Dispute #1" })).toBeInTheDocument();
    const tinted = Array.from(container.querySelectorAll("[class]")).filter((element) => element.classList.contains("bg-(--dr-record-surface)"));
    expect(tinted).toEqual([]);
  });
});

describe("DisputeTimeline", () => {
  it("counts the current step down, marks past steps concluded and gives upcoming steps their duration", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2, lastPeriodChange: NOW - HOUR, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    expect(columns()).toEqual([
      { name: "Evidence", state: "concluded", text: expect.stringContaining("Concluded") as string },
      { name: "Voting", state: "current", text: expect.stringContaining("01d 23h 00m") as string },
      { name: "Appeal", state: "upcoming", text: expect.stringContaining("01d 00h 00m") as string },
      { name: "Execution", state: "upcoming", text: "Execution" },
    ]);
    expect(within(screen.getByRole("list", { name: "Dispute timeline" })).getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
  });

  it("advances the countdown on the shared clock", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 0, lastPeriodChange: NOW, court: { timesPerPeriod: [BigInt(DAY), 0n, BigInt(DAY), BigInt(DAY)] } }));
    expect(columns()[0]?.text).toContain("01d 00h 00m");
    act(() => {
      vi.advanceTimersByTime(HOUR * 1000);
    });
    expect(columns()[0]?.text).toContain("00d 23h 00m");
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
    expect(screen.queryByRole("list", { name: "Dispute timeline" })).not.toBeInTheDocument();
    expect(decisionAlert("Jury decision")).toBeInTheDocument();
  });

  it("shows a loading placeholder until the view settles", () => {
    renderSection(DisputeTimeline, caseDispute({ view: "loading" }));
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("renders the current countdown once at every width", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    expect(screen.getAllByRole("time")).toHaveLength(1);
    expect(screen.getAllByText(/^Ends in/)).toHaveLength(1);
  });

  it("anchors the phone countdown inside the rail's reserved room", () => {
    const { unmount } = renderSection(DisputeTimeline, caseDispute({ period: 2, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    const current = screen.getByRole("time").parentElement;
    expect(current).toHaveClass("max-lg:absolute", "max-lg:inset-x-0", "max-lg:bottom-0", "lg:static");
    expect(current).not.toHaveClass("top-full");
    expect(current).not.toHaveClass("max-lg:top-full");
    expect(screen.getByRole("list", { name: "Dispute timeline" })).toHaveClass("relative", "max-lg:pb-14");
    expect(steps()[1]).not.toHaveClass("relative");
    unmount();

    renderSection(DisputeTimeline, caseDispute({ period: 4 }));
    expect(screen.queryByRole("time")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Dispute timeline" })).not.toHaveClass("max-lg:pb-14");
    expect(document.querySelector('[class~="max-lg:absolute"]')).toBeNull();
  });

  it("keeps every step name at the small size and marks the current step by colour and aria-current", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    const names = steps().map((step) => within(step).getByText(/^(?:Evidence|Commit|Voting|Appeal|Execution)$/));
    for (const name of names) {
      expect(name).toHaveClass("text-sm", "font-semibold");
      expect(name).not.toHaveClass("text-base");
      expect(name.className).not.toMatch(/(?:^|\s)[\w-]+:text-(?:xs|base|lg)/);
    }
    expect(steps().map((step) => step.getAttribute("aria-current"))).toEqual([null, "step", null, null]);
    expect(names.map((name) => name.classList.contains("text-klerosUIComponentsPrimaryText"))).toEqual([false, true, false, false]);
    expect(names.map((name) => name.classList.contains("text-klerosUIComponentsSecondaryText"))).toEqual([true, false, true, true]);
  });

  it("draws the rail in halves so the first and last bullets have no outer line", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2 }));
    const halves = steps().map(railHalves);
    expect(halves.map((pair) => pair.length)).toEqual([2, 2, 2, 2]);
    const [first, second, third, last] = halves;
    expect(first?.[0]).toHaveClass("invisible");
    expect(last?.[1]).toHaveClass("invisible");
    expect(first?.[1]).toHaveClass("bg-klerosUIComponentsPrimaryBlue");
    expect(second?.[0]).toHaveClass("bg-klerosUIComponentsPrimaryBlue");
    expect(second?.[1]).toHaveClass("bg-klerosUIComponentsStroke");
    expect(third?.[0]).toHaveClass("bg-klerosUIComponentsStroke");
    expect(third?.[1]).toHaveClass("bg-klerosUIComponentsStroke");
    expect(last?.[0]).toHaveClass("bg-klerosUIComponentsStroke");
  });

  it("hides the concluded and upcoming details from sighted phone readers only", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    expect(screen.getByText("Concluded")).toHaveClass("max-sm:sr-only", "text-sm", "text-klerosUIComponentsSecondaryText");
    expect(screen.getByText("Lasts 01d 00h 00m")).toHaveClass("max-sm:sr-only", "text-sm", "text-klerosUIComponentsSecondaryText");
    expect(stepDetail("Ends in")).not.toHaveClass("max-sm:sr-only");
    expect(stepDetail("Ends in").closest('[class~="max-sm:sr-only"]')).toBeNull();
  });
});

describe("DecisionAlert", () => {
  it.each([0, 1, 2] as const)("spec 5.9: shows no decision in period %i", (period) => {
    const { container } = renderSection(DecisionAlert, caseDispute({ period }));
    expect(container).toBeEmptyDOMElement();
  });

  it("spec 5.9: in the appeal period shows the jury decision and that it can be appealed", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { currentRuling: { ok: true, value: 1n } } }));
    expect(screen.getByRole("heading", { name: "Jury decision" })).toBeInTheDocument();
    expect(within(decisionAlert("Jury decision")).getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText(/can be appealed within the appeal period/)).toBeInTheDocument();
    expect(screen.queryByText(/arbitrable application/)).not.toBeInTheDocument();
  });

  it("spec 5.9: a view-only dispute points to the arbitrable application to appeal", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { localId: { kind: "unresolved", reason: "reverted" } } }));
    expect(screen.getByText(/Go to the arbitrable application to appeal this ruling/)).toBeInTheDocument();
  });

  it("spec 5.9: ruling 0 reads as refused to arbitrate", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { currentRuling: { ok: true, value: 0n } } }));
    expect(within(decisionAlert("Jury decision")).getByText(REFUSED_RULING_TEXT)).toBeInTheDocument();
  });

  it("spec 5.9: in execution the single funded ruling wins by default", () => {
    renderSection(DecisionAlert, caseDispute({ period: 4, details: { currentRuling: { ok: true, value: 1n } }, fundedRulings: { ok: true, value: [2n] } }));
    expect(screen.getByRole("heading", { name: "Winner" })).toBeInTheDocument();
    expect(within(decisionAlert("Winner")).getByText("No")).toBeInTheDocument();
    expect(within(decisionAlert("Winner")).getByText("Won by default")).toBeInTheDocument();
  });

  it("spec 5.9: in execution without a single funded ruling the jury decision wins", () => {
    renderSection(DecisionAlert, caseDispute({ period: 4, details: { currentRuling: { ok: true, value: 1n } }, fundedRulings: { ok: true, value: [1n, 2n] } }));
    expect(screen.getByRole("heading", { name: "Winner" })).toBeInTheDocument();
    expect(within(decisionAlert("Winner")).getByText("Yes")).toBeInTheDocument();
    expect(within(decisionAlert("Winner")).getByText("Won by jury decision")).toBeInTheDocument();
  });

  it("P-24: the decision alert names a title-less single-select ruling by its number", () => {
    const metaEvidence = sectionReady(testOkMetaEvidence({ rulingOptions: { type: "single-select" } }));
    renderSection(DecisionAlert, caseDispute({ period: 3, metaEvidence, details: { currentRuling: { ok: true, value: 2n } } }));
    expect(within(decisionAlert("Jury decision")).getByText("2")).toBeInTheDocument();
  });

  it("D-36: a failed current-ruling read shows the decision as unavailable", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { currentRuling: { ok: false, error: { code: "rpc-error", message: "currentRuling could not be read." } } } }));
    expect(screen.getByText("Decision unavailable")).toBeInTheDocument();
    expect(screen.getByText("currentRuling could not be read.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^(?:Jury decision|Winner)$/ })).not.toBeInTheDocument();
  });

  it("P-20: holds a placeholder in the appeal period until the view settles, and nothing before it", () => {
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
  ])("spec 5.10: picks the notice by its fixed priority (%o)", (question, title, role) => {
    const { container } = renderSection(RealityNotice, withQuestion(question));
    const notice = container.firstElementChild;
    expect(notice).toHaveTextContent(title);
    expect(notice?.getAttribute("role") ?? "").toBe(role);
  });

  it("spec 5.10: appends the question recorded on-chain with its line breaks", () => {
    const { container } = renderSection(RealityNotice, withQuestion({ status: "unverified", title: "Will it rain?\nAnswer by noon." }));
    const notice = container.firstElementChild;
    expect(notice?.textContent).toContain("Question recorded on-chain: Will it rain?\nAnswer by noon.");
    expect(notice).toHaveClass("whitespace-pre-line");
  });

  it("CS-1 spec 5.10: adds no on-chain question line for an empty question title", () => {
    const { container } = renderSection(RealityNotice, withQuestion({ status: "malformed", title: "" }));
    expect(container).toHaveTextContent("The question parameters are malformed");
    expect(container.textContent).not.toContain("Question recorded on-chain:");
  });

  it("spec 5.10: shows no notice for a verified question, without a Reality question, or before the meta-evidence loads", () => {
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
