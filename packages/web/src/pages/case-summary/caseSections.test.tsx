import { REFUSED_RULING_TEXT, buildDisputeView, getChain, type ChainConfig, type Court, type DisputeReads, type MetaEvidenceResult, type Outcome, type Period, type RealityQuestionInfo } from "@dispute-resolver/core";
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionBoundary } from "../../ui";
import type { CaseDispute, SectionData } from "../../data";
import {
  TestDataProvider,
  sectionLoading,
  sectionReady,
  sectionUnavailable,
  testCourt,
  testDetails,
  testFamily,
  testFoundLookup,
  testOkMetaEvidence,
} from "../../test/data";
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

function columns(): { name: string | null; state: string | null; text: string }[] {
  return screen.getAllByTestId("timeline-column").map((column) => ({
    name: column.getAttribute("data-name"),
    state: column.getAttribute("data-state"),
    text: column.textContent,
  }));
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
    expect(screen.getByTestId("case-votes")).toHaveAttribute("data-value", "5");
    expect(screen.getByTestId("case-votes")).toHaveTextContent("5");
    expect(screen.getByTestId("case-court")).toHaveTextContent("Blockchain Court");
    expect(screen.getByText("Voting")).toBeInTheDocument();
  });

  it("P-20: shows the period from the lookup while the view is still loading", () => {
    renderSection(CaseOverview, caseDispute({ period: 3, view: "loading" }));
    expect(screen.getByText("Appeal")).toBeInTheDocument();
    expect(screen.queryByTestId("case-votes")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("D-36: a missing vote count degrades the votes only", () => {
    renderSection(CaseOverview, caseDispute({ details: { votesLengths: { ok: true, value: [] } } }));
    expect(screen.queryByTestId("case-votes")).not.toBeInTheDocument();
    expect(screen.getByText(/no valid vote count/)).toBeInTheDocument();
    expect(screen.getByTestId("case-court")).toHaveTextContent("General Court");
  });

  it("D-19: a court whose policy failed to load shows its ID instead of a name", () => {
    renderSection(CaseOverview, caseDispute({ court: { id: 0n, name: null } }));
    expect(screen.queryByTestId("case-court")).not.toBeInTheDocument();
    expect(screen.getByText("Court #0 (name unavailable)")).toBeInTheDocument();
  });

  it("D-36: a court missing from the list shows the court as unavailable", () => {
    renderSection(CaseOverview, caseDispute({ courts: { ok: true, value: [] } }));
    expect(screen.getByText(/Court 0 is not in the court list/)).toBeInTheDocument();
    expect(screen.getByTestId("case-votes")).toHaveAttribute("data-value", "3");
  });

  it("D-53: renders nothing for a lookup that found no dispute", () => {
    const dispute = caseDispute();
    const { container } = renderSection(CaseOverview, { ...dispute, view: sectionReady({ exists: false, reason: "not-found" }) });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DisputeTimeline", () => {
  it("spec 5.7: the current column counts down, past ones are concluded and upcoming ones show their duration", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 2, lastPeriodChange: NOW - HOUR, court: { timesPerPeriod: [3n * BigInt(DAY), 0n, 2n * BigInt(DAY), BigInt(DAY)] } }));
    expect(columns()).toEqual([
      { name: "evidence", state: "concluded", text: expect.stringContaining("Concluded") as string },
      { name: "vote", state: "current", text: expect.stringContaining("01d 23h 00m") as string },
      { name: "appeal", state: "upcoming", text: expect.stringContaining("01d 00h 00m") as string },
      { name: "execution", state: "upcoming", text: "Execution" },
    ]);
    expect(within(screen.getByRole("list", { name: "Dispute timeline" })).getAllByRole("listitem")[1]).toHaveAttribute("aria-current", "step");
  });

  it("spec 5.7: the countdown advances on the shared clock", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 0, lastPeriodChange: NOW, court: { timesPerPeriod: [BigInt(DAY), 0n, BigInt(DAY), BigInt(DAY)] } }));
    expect(columns()[0]?.text).toContain("01d 00h 00m");
    act(() => {
      vi.advanceTimersByTime(HOUR * 1000);
    });
    expect(columns()[0]?.text).toContain("00d 23h 00m");
  });

  it("D-39: shows the commit column for a hidden-vote court", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 1, court: { hiddenVotes: true } }));
    expect(columns().map(({ name, state }) => [name, state])).toEqual([
      ["evidence", "concluded"],
      ["commit", "current"],
      ["vote", "upcoming"],
      ["appeal", "upcoming"],
      ["execution", "upcoming"],
    ]);
  });

  it("D-39: in the execution period every earlier column is concluded and execution is current", () => {
    renderSection(DisputeTimeline, caseDispute({ period: 4 }));
    expect(columns().map(({ name, state }) => [name, state])).toEqual([
      ["evidence", "concluded"],
      ["vote", "concluded"],
      ["appeal", "concluded"],
      ["execution", "current"],
    ]);
  });

  it("D-36: a court missing from the list degrades the timeline and nothing else", () => {
    const dispute = caseDispute({ period: 3, courts: { ok: true, value: [] } });
    render(
      <TestDataProvider>
        <DisputeTimeline dispute={dispute} chain={MAINNET} />
        <DecisionAlert dispute={dispute} chain={MAINNET} />
      </TestDataProvider>,
    );
    expect(screen.getByText("Timeline unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-column")).not.toBeInTheDocument();
    expect(screen.getByTestId("case-decision")).toHaveAttribute("data-kind", "jury-decision");
  });

  it("P-20: shows a loading placeholder until the view settles", () => {
    renderSection(DisputeTimeline, caseDispute({ view: "loading" }));
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});

describe("DecisionAlert", () => {
  it.each([0, 1, 2] as const)("spec 5.9: shows no decision in period %i", (period) => {
    renderSection(DecisionAlert, caseDispute({ period }));
    const decision = screen.getByTestId("case-decision");
    expect(decision).toHaveAttribute("data-kind", "none");
    expect(decision).not.toHaveAttribute("data-won-by");
    expect(decision).toBeEmptyDOMElement();
  });

  it("spec 5.9: in the appeal period shows the jury decision and that it can be appealed", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { currentRuling: { ok: true, value: 1n } } }));
    expect(screen.getByTestId("case-decision")).toHaveAttribute("data-kind", "jury-decision");
    expect(screen.getByRole("heading", { name: "Jury decision" })).toBeInTheDocument();
    expect(screen.getByTestId("case-decision-ruling")).toHaveTextContent(/^Yes$/);
    expect(screen.getByText(/can be appealed within the appeal period/)).toBeInTheDocument();
    expect(screen.queryByText(/arbitrable application/)).not.toBeInTheDocument();
  });

  it("spec 5.9: a view-only dispute points to the arbitrable application to appeal", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { localId: { kind: "unresolved", reason: "reverted" } } }));
    expect(screen.getByText(/Go to the arbitrable application to appeal this ruling/)).toBeInTheDocument();
  });

  it("spec 5.9: ruling 0 reads as refused to arbitrate", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { currentRuling: { ok: true, value: 0n } } }));
    expect(screen.getByTestId("case-decision-ruling")).toHaveTextContent(REFUSED_RULING_TEXT);
  });

  it("spec 5.9: in execution the single funded ruling wins by default", () => {
    renderSection(DecisionAlert, caseDispute({ period: 4, details: { currentRuling: { ok: true, value: 1n } }, fundedRulings: { ok: true, value: [2n] } }));
    const decision = screen.getByTestId("case-decision");
    expect(decision).toHaveAttribute("data-kind", "winner");
    expect(decision).toHaveAttribute("data-won-by", "default");
    expect(screen.getByRole("heading", { name: "Winner" })).toBeInTheDocument();
    expect(screen.getByTestId("case-decision-ruling")).toHaveTextContent(/^No$/);
    expect(screen.getByText("Won by default")).toBeInTheDocument();
  });

  it("spec 5.9: in execution without a single funded ruling the jury decision wins", () => {
    renderSection(DecisionAlert, caseDispute({ period: 4, details: { currentRuling: { ok: true, value: 1n } }, fundedRulings: { ok: true, value: [1n, 2n] } }));
    expect(screen.getByTestId("case-decision")).toHaveAttribute("data-won-by", "jury");
    expect(screen.getByTestId("case-decision-ruling")).toHaveTextContent(/^Yes$/);
    expect(screen.getByText("Won by jury decision")).toBeInTheDocument();
  });

  it("D-36: a failed current-ruling read shows the decision as unavailable", () => {
    renderSection(DecisionAlert, caseDispute({ period: 3, details: { currentRuling: { ok: false, error: { code: "rpc-error", message: "currentRuling could not be read." } } } }));
    expect(screen.getByText("Decision unavailable")).toBeInTheDocument();
    expect(screen.getByText("currentRuling could not be read.")).toBeInTheDocument();
    expect(screen.queryByTestId("case-decision")).not.toBeInTheDocument();
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
    renderSection(RealityNotice, withQuestion(question));
    const notice = screen.getByTestId("case-reality-notice");
    expect(notice).toHaveTextContent(title);
    expect(notice.getAttribute("role") ?? "").toBe(role);
  });

  it("spec 5.10: appends the question recorded on-chain with its line breaks", () => {
    renderSection(RealityNotice, withQuestion({ status: "unverified", title: "Will it rain?\nAnswer by noon." }));
    const notice = screen.getByTestId("case-reality-notice");
    expect(notice.textContent).toContain("Question recorded on-chain: Will it rain?\nAnswer by noon.");
    expect(notice).toHaveClass("whitespace-pre-line");
  });

  it("CS-1 spec 5.10: adds no on-chain question line for an empty question title", () => {
    renderSection(RealityNotice, withQuestion({ status: "malformed", title: "" }));
    const notice = screen.getByTestId("case-reality-notice");
    expect(notice).toHaveTextContent("The question parameters are malformed");
    expect(notice.textContent).not.toContain("Question recorded on-chain:");
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
