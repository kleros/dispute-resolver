import { getChain, type ChainConfig, type MetaEvidenceResult } from "@dispute-resolver/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CaseDispute, SectionData } from "../../data";
import { TestDataProvider, sectionLoading, sectionReady, testFoundLookup, testOkMetaEvidence } from "../../test/data";
import { testMetaEvidence } from "../../test/safe-content";
import { QuestionPanel } from "./QuestionPanel";

function gnosis(): ChainConfig {
  const chain = getChain(100);
  if (chain === undefined) throw new Error("Gnosis is not configured");
  return chain;
}

const GNOSIS = gnosis();

function caseDispute(metaEvidence: SectionData<MetaEvidenceResult>): CaseDispute {
  return {
    status: "dispute",
    chainId: 100,
    disputeId: 12n,
    lookup: sectionReady(testFoundLookup({ chainId: 100, disputeId: 12n })),
    view: sectionLoading,
    family: sectionLoading,
    metaEvidence,
    disputeEvent: sectionLoading,
    evidence: sectionLoading,
    courts: sectionLoading,
    appealPanel: sectionLoading,
    write: sectionLoading,
  };
}

function renderPanel(metaEvidence: SectionData<MetaEvidenceResult>, onRetry?: () => void) {
  return render(
    <TestDataProvider>
      <QuestionPanel dispute={caseDispute(metaEvidence)} chain={GNOSIS} onRetry={onRetry} />
    </TestDataProvider>,
  );
}

function optionLines(): string[] {
  return within(screen.getByRole("list")).getAllByRole("listitem").map((item) => item.textContent);
}

describe("QuestionPanel (spec 5.13)", () => {
  it("spec 5.13: shows the question type and the question as plain text", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ question: "Should **Alice** be paid?\nAnswer carefully.", rulingOptions: { type: "uint", precision: 2 } })));
    expect(screen.getByText("Non-negative number")).toBeInTheDocument();
    const question = screen.getByTestId("case-question");
    expect(question).toHaveTextContent("Should **Alice** be paid? Answer carefully.");
    expect(question.querySelector("strong")).toBeNull();
  });

  it("spec 5.13: a select question lists its options, view only, with the note that jurors vote on Court", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "single-select", titles: ["Yes", "No"], descriptions: ["Release the funds"] } })));
    expect(screen.getByText("Multiple choice: single select")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Voting options" })).toBeInTheDocument();
    expect(optionLines()).toEqual(["Option 0 - Refuse to Arbitrate / Invalid", "Option 1 - Yes: Release the funds", "Option 2 - No"]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Note that you can only view the voting options\. Selected jurors can vote using/)).toBeInTheDocument();
    const court = screen.getByRole("link", { name: "Court" });
    expect(court).toHaveAttribute("href", "https://court.kleros.io/cases/12?requiredChainId=100");
    expect(court).toHaveAttribute("target", "_blank");
    expect(court).toHaveAttribute("rel", "noopener noreferrer");
    expect(court).not.toHaveAttribute("data-testid");
  });

  it("spec 5.13: a multiple-select question lists its reserved answers with shortened codes", () => {
    const code = `0x${"f".repeat(64)}`;
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "multiple-select", titles: ["Red"], reserved: { [code]: "Answered Too Soon" } } })));
    expect(screen.getByText("Multiple choice: multiple select")).toBeInTheDocument();
    expect(optionLines()).toEqual(["Option 0 - Refuse to Arbitrate / Invalid", "Option 1 - Red", "Option 0xffff...ffffff - Answered Too Soon"]);
  });

  it("spec 5.13: other question types list no options and no note", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ question: "When?", rulingOptions: { type: "datetime" } })));
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Court" })).not.toBeInTheDocument();
  });

  it("spec 5.13: an unknown question type has no label, as today", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ question: "Is it true?", rulingOptions: { type: "bool", titles: ["Yes"] } })));
    expect(screen.getByTestId("case-question")).toHaveTextContent("Is it true?");
    expect(screen.queryByText(/Multiple choice/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("§12.1: case-ruling-options carries the type, titles, reserved answers and precision", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "uint", titles: ["A"], reserved: { "0x01": "Too soon" }, precision: 0 } })));
    expect(JSON.parse(screen.getByTestId("case-ruling-options").getAttribute("data-ruling-options") ?? "")).toEqual({
      type: "uint",
      titles: ["A"],
      reserved: { "0x01": "Too soon" },
      precision: 0,
    });
  });

  it("§12.1: case-question is absent when the meta-evidence has no question", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ question: null })));
    expect(screen.queryByTestId("case-question")).not.toBeInTheDocument();
    expect(screen.getByTestId("case-ruling-options")).toBeInTheDocument();
  });

  it("spec 5.13: meta-evidence without ruling options shows neither a type nor options", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ question: "Who wins?", rulingOptions: null })));
    expect(screen.getByTestId("case-question")).toHaveTextContent("Who wins?");
    expect(screen.queryByTestId("case-ruling-options")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("A2: the placeholder of a rejected meta-evidence shows its own options", () => {
    const placeholder = testMetaEvidence({ title: "Invalid or tampered meta-evidence", rulingOptions: { type: "single-select", titles: ["Yes", "No"] } });
    renderPanel(sectionReady({ status: "invalid", metaEvidence: placeholder, reason: "uri-not-content-addressed" }));
    expect(optionLines()).toHaveLength(3);
  });

  it("D-36: a failed meta-evidence load degrades the panel with its reason and a Retry", async () => {
    const onRetry = vi.fn();
    renderPanel(sectionReady({ status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "The gateway did not answer." } }), onRetry);
    expect(screen.getByText("Question unavailable")).toBeInTheDocument();
    expect(screen.getByText("The gateway did not answer.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry Question" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("D-36: a dispute without meta-evidence says so instead of showing an empty panel", () => {
    renderPanel(sectionReady({ status: "missing" }));
    expect(screen.getByText("Question unavailable")).toBeInTheDocument();
    expect(screen.getByText(/has no meta-evidence/)).toBeInTheDocument();
  });

  it("spec 5.11: the panel shows a placeholder while the meta-evidence loads", () => {
    renderPanel(sectionLoading);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("case-ruling-options")).not.toBeInTheDocument();
  });
});
