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
    appealDecisions: sectionLoading,
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
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

describe("QuestionPanel", () => {
  it("shows the question type and the question as plain text", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ question: "Should **Alice** be paid?\nAnswer carefully.", rulingOptions: { type: "uint", precision: 2 } })));
    expect(screen.getByText("Non-negative number")).toBeInTheDocument();
    const question = screen.getByText("Should **Alice** be paid? Answer carefully.");
    expect(question.textContent).toBe("Should **Alice** be paid?\nAnswer carefully.");
    expect(question.querySelector("strong")).toBeNull();
  });

  it("a select question lists its options, view only, with the note that jurors vote on Court", () => {
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
  });

  it("a multiple-select question lists its reserved answers with shortened codes", () => {
    const code = `0x${"f".repeat(64)}`;
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "multiple-select", titles: ["Red"], reserved: { [code]: "Answered Too Soon" } } })));
    expect(screen.getByText("Multiple choice: multiple select")).toBeInTheDocument();
    expect(optionLines()).toEqual(["Option 0 - Refuse to Arbitrate / Invalid", "Option 1 - Red", "Option 0xffff...ffffff - Answered Too Soon"]);
  });

  it("keeps a non-select question to its question and type line", () => {
    const { container } = renderPanel(sectionReady(testOkMetaEvidence({ question: "When?", rulingOptions: { type: "datetime" } })));
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Court" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Voting options" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Note that you can only view the voting options/)).not.toBeInTheDocument();
    expect(container.textContent).toBe("When?Date");
  });

  it("puts the question type under the question as a caption for every type", () => {
    const cases = [
      { rulingOptions: { type: "uint", precision: 0 }, label: "Non-negative number" },
      { rulingOptions: { type: "single-select", titles: ["Yes"] }, label: "Multiple choice: single select" },
    ];
    for (const { rulingOptions, label } of cases) {
      const { container, unmount } = renderPanel(sectionReady(testOkMetaEvidence({ question: "Who wins?", rulingOptions })));
      const question = screen.getByText("Who wins?");
      const type = screen.getByText(label);
      expect(question.compareDocumentPosition(type) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(type.parentElement).toBe(question.parentElement);
      expect(question.parentElement).toHaveClass("gap-1");
      if (rulingOptions.type === "uint") expect(container.textContent).toBe("Who wins?Non-negative number");
      unmount();
    }
  });

  it("sets every question in the bold lead style, whatever its length", () => {
    const long =
      "Did the submitter follow the listing policy for this registry entry, including the address, the name, the ticker, the logo and every other field the policy requires?";
    const { unmount } = renderPanel(sectionReady(testOkMetaEvidence({ question: long, rulingOptions: { type: "uint", precision: 0 } })));
    const longQuestion = screen.getByText(long);
    expect(longQuestion).toHaveClass("font-semibold", "text-lg", "text-klerosUIComponentsPrimaryText");
    expect(longQuestion).not.toHaveClass("font-normal");
    expect(longQuestion.parentElement?.parentElement).toHaveClass("max-w-[72ch]");
    unmount();

    renderPanel(sectionReady(testOkMetaEvidence({ question: "Who wins?", rulingOptions: { type: "uint", precision: 0 } })));
    const shortQuestion = screen.getByText("Who wins?");
    expect(shortQuestion).toHaveClass("font-semibold", "text-lg", "text-klerosUIComponentsPrimaryText");
    expect(shortQuestion).not.toHaveClass("font-normal");
  });

  it("shows each option's title before its code on screen while the item still reads Option N - Title: description", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "single-select", titles: ["Yes", "No"], descriptions: ["Release the funds"] } })));
    expect(optionLines()).toEqual(["Option 0 - Refuse to Arbitrate / Invalid", "Option 1 - Yes: Release the funds", "Option 2 - No"]);
    const item = within(screen.getByRole("list")).getAllByRole("listitem")[1];
    if (item === undefined) throw new Error("The second option is missing");
    const code = within(item).getByText("Option 1");
    const title = within(item).getByText("Yes");
    expect(code.tagName).toBe("SPAN");
    expect(code).toHaveClass("order-last", "tabular-nums", "text-klerosUIComponentsSecondaryText");
    expect(title.tagName).toBe("SPAN");
    expect(title).toHaveClass("font-semibold", "text-base");
    expect(code.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(code.querySelector(".sr-only")?.textContent).toBe(" - ");
  });

  it("renders no description line for an empty description and keeps the colon in the item's text", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "single-select", titles: ["Yes", "No"], descriptions: ["", "Pay the seller"] } })));
    const [, yes, no] = within(screen.getByRole("list")).getAllByRole("listitem");
    if (yes === undefined || no === undefined) throw new Error("The titled options are missing");
    const paragraphs = (item: HTMLElement) => Array.from(item.children).filter((child) => child.tagName === "P");
    expect(paragraphs(yes)).toHaveLength(1);
    expect(yes.textContent.trimEnd()).toBe("Option 1 - Yes:");
    const noParagraphs = paragraphs(no);
    expect(noParagraphs).toHaveLength(2);
    const description = noParagraphs[1];
    expect(description).toHaveClass("text-sm", "leading-5", "max-w-[72ch]", "whitespace-pre-line");
    expect(description?.firstElementChild).toHaveClass("sr-only");
    expect(description?.firstElementChild?.textContent).toBe(": ");
    expect(description?.textContent).toBe(": Pay the seller");
  });

  it("draws the options as a spaced list that keeps its list semantics", () => {
    const { container } = renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "single-select", titles: ["Yes"], descriptions: ["Pay"] } })));
    const chrome = /(^|\s)(border|divide-|bg-|shadow)/;
    for (const element of container.querySelectorAll("*")) {
      expect(element.getAttribute("class") ?? "").not.toMatch(chrome);
    }
    const section = screen.getByRole("heading", { level: 3, name: "Voting options" }).closest("section");
    if (section === null) throw new Error("The options section is missing");
    expect(section).not.toHaveAttribute("role");
    expect(section.querySelectorAll("[role]")).toHaveLength(0);
    const list = within(section).getByRole("list");
    expect(list).toHaveClass("mt-2", "gap-4", "[list-style-type:'']");
    expect(list).not.toHaveAttribute("role");
    const item = within(list).getAllByRole("listitem")[1];
    expect(item).toHaveClass("gap-1");
    expect(item?.firstElementChild).toHaveClass("flex-wrap", "items-baseline", "gap-x-4", "gap-y-1");
  });

  it("sets the heading apart with more room above than below and keeps the Court note last", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ question: "Who wins?", rulingOptions: { type: "single-select", titles: ["Yes"] } })));
    const heading = screen.getByRole("heading", { level: 3, name: "Voting options" });
    expect(heading).toHaveClass("text-base", "leading-6", "font-semibold", "text-klerosUIComponentsPrimaryText");
    const section = heading.closest("section");
    if (section === null) throw new Error("The options section is missing");
    expect(section).toHaveAttribute("aria-labelledby", heading.id);
    expect(section.parentElement).toHaveClass("gap-6");
    const note = screen.getByRole("link", { name: "Court" }).closest("p");
    expect(note).toHaveClass("mt-6");
    expect(section.lastElementChild).toBe(note);
    expect(note?.querySelector("svg")).toBeNull();
    expect(note?.querySelector("img")).toBeNull();
  });

  it("an unknown question type has no label", () => {
    const { container } = renderPanel(sectionReady(testOkMetaEvidence({ question: "Is it true?", rulingOptions: { type: "bool", titles: ["Yes"] } })));
    expect(container).toHaveTextContent(/^Is it true\?$/);
    expect(screen.queryByText(/Multiple choice/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("a number question shows its type alone, never the titles or reserved answers it carries", () => {
    const { container } = renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "uint", titles: ["A"], reserved: { "0x01": "Too soon" }, precision: 0 } })));
    expect(container).toHaveTextContent(/^Non-negative number$/);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("a meta-evidence without a question shows the type and the options with nothing between them", () => {
    const { container } = renderPanel(sectionReady(testOkMetaEvidence({ question: null })));
    expect(container).toHaveTextContent(/^Multiple choice: single selectVoting options/);
    expect(screen.getByRole("heading", { level: 3, name: "Voting options" })).toBeInTheDocument();
  });

  it("meta-evidence without ruling options shows neither a type nor options", () => {
    const { container } = renderPanel(sectionReady(testOkMetaEvidence({ question: "Who wins?", rulingOptions: null })));
    expect(container).toHaveTextContent(/^Who wins\?$/);
    expect(screen.queryByRole("heading", { name: "Voting options" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("the placeholder of a rejected meta-evidence shows its own options", () => {
    const placeholder = testMetaEvidence({ title: "Invalid or tampered meta-evidence", rulingOptions: { type: "single-select", titles: ["Yes", "No"] } });
    renderPanel(sectionReady({ status: "invalid", metaEvidence: placeholder, reason: "uri-not-content-addressed" }));
    expect(optionLines()).toHaveLength(3);
  });

  it("a failed meta-evidence load degrades the panel with its reason and a Retry", async () => {
    const onRetry = vi.fn();
    renderPanel(sectionReady({ status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "The gateway did not answer." } }), onRetry);
    expect(screen.getByText("Question unavailable")).toBeInTheDocument();
    expect(screen.getByText("The gateway did not answer.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry Question" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("a dispute without meta-evidence says so instead of showing an empty panel", () => {
    renderPanel(sectionReady({ status: "missing" }));
    expect(screen.getByText("Question unavailable")).toBeInTheDocument();
    expect(screen.getByText(/has no meta-evidence/)).toBeInTheDocument();
  });

  it("shows a placeholder while the meta-evidence loads", () => {
    renderPanel(sectionLoading);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/Multiple choice/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Voting options" })).not.toBeInTheDocument();
  });

  it("shows a question that arrives after its placeholder without a reveal of its own", () => {
    const { rerender } = renderPanel(sectionLoading);
    const ready = sectionReady(testOkMetaEvidence({ question: "Should Alice be paid?" }));
    rerender(
      <TestDataProvider>
        <QuestionPanel dispute={caseDispute(ready)} chain={GNOSIS} />
      </TestDataProvider>,
    );
    expect(screen.getByText("Should Alice be paid?")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("t-reveal-in");
  });

  it("shows a question that was ready on the first render without motion", () => {
    const { container } = renderPanel(sectionReady(testOkMetaEvidence({ question: "Should Alice be paid?" })));
    expect(container.innerHTML).not.toContain("t-reveal-in");
  });
});
