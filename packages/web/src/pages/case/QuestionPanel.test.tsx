import { NONE_OF_THE_OPTIONS_TEXT, REFUSED_RULING_TEXT, type DisputeLookup, type MetaEvidenceResult } from "@dispute-resolver/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CaseDispute, SectionData } from "../../data";
import { TestDataProvider, sectionLoading, sectionReady, sectionUnavailable, testCaseDispute, testChain, testFoundLookup, testOkMetaEvidence } from "../../test/data";
import { testMetaEvidence } from "../../test/safe-content";
import { QuestionPanel } from "./QuestionPanel";

const GNOSIS = testChain(100);
const MAX_UINT256 = 2n ** 256n - 1n;
const ANSWERED_TOO_SOON = `0x${"f".repeat(64)}`;

/** The arbitrator's dispute 12 on Gnosis, with `numberOfChoices` choices (2 by default, as for Yes and No). */
function foundLookup(numberOfChoices?: bigint): SectionData<DisputeLookup> {
  const found = testFoundLookup({ chainId: 100, disputeId: 12n });
  return sectionReady(numberOfChoices === undefined ? found : { ...found, dispute: { ...found.dispute, numberOfChoices } });
}

function caseDispute(metaEvidence: SectionData<MetaEvidenceResult>, lookup: SectionData<DisputeLookup> = foundLookup()): CaseDispute {
  return testCaseDispute({ chainId: 100, disputeId: 12n, lookup, metaEvidence });
}

function renderPanel(metaEvidence: SectionData<MetaEvidenceResult>, lookup?: SectionData<DisputeLookup>) {
  return render(
    <TestDataProvider>
      <QuestionPanel dispute={caseDispute(metaEvidence, lookup)} chain={GNOSIS} />
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
    renderPanel(sectionReady(testOkMetaEvidence({ question: "Who wins?", rulingOptions: { type: "single-select", titles: ["Yes", "No"], descriptions: ["Release the funds"] } })));
    const question = screen.getByText("Who wins?");
    const type = screen.getByText("Multiple choice: single select");
    expect(question.compareDocumentPosition(type) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(type.parentElement).toBe(question.parentElement);
    expect(screen.getByRole("heading", { level: 3, name: "Voting options" })).toBeInTheDocument();
    expect(optionLines()).toEqual(["Option 0 - Invalid / Refused to Arbitrate / Tied", "Option 1 - Yes: Release the funds", "Option 2 - No"]);
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
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Note that you can only view the voting options\. Selected jurors can vote using/)).toBeInTheDocument();
    const court = screen.getByRole("link", { name: "Court" });
    expect(court).toHaveAttribute("href", "https://court.kleros.io/cases/12?requiredChainId=100");
    expect(court).toHaveAttribute("target", "_blank");
    expect(court).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("a multiple-select lists option 1 for nothing ticked with its code, and each title as a box without a code", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "multiple-select", titles: ["Red", "Green"], descriptions: ["The red one"] } })));
    expect(optionLines()).toEqual([`Option 0 - ${REFUSED_RULING_TEXT}`, `Option 1 - ${NONE_OF_THE_OPTIONS_TEXT}`, "Red: The red one", "Green"]);
    const [, none, red] = within(screen.getByRole("list")).getAllByRole("listitem");
    if (none === undefined || red === undefined) throw new Error("The multiple-select options are missing");
    const noneCode = within(none).getByText("Option 1");
    expect(noneCode).toHaveClass("order-last", "tabular-nums");
    expect(noneCode.querySelector(".sr-only")?.textContent).toBe(" - ");
    expect(red.querySelector(".order-last")).toBeNull();
    expect(within(red).getByText("Red")).toHaveClass("font-semibold", "text-base");
    expect(red.textContent).not.toContain(" - ");
  });

  it("leaves out a reserved answer the contract does not accept and says so in one line between the list and the Court note", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "single-select", titles: ["Yes", "No"], reserved: { "0x3": "Withdrawn" } } })));
    expect(optionLines()).toEqual([`Option 0 - ${REFUSED_RULING_TEXT}`, "Option 1 - Yes", "Option 2 - No"]);
    const line = screen.getByText("The case's description also lists an answer the contract does not accept, so it is not shown.");
    const list = screen.getByRole("list");
    const note = screen.getByRole("link", { name: "Court" }).closest("p");
    if (note === null) throw new Error("The Court note is missing");
    expect(list.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the reserved answers the dispute's choices reach, a code equal to the number of choices included", () => {
    const reserved = { "0x5": "Withdrawn", "0x9": "Too late", "0x10": "Spam" };
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "multiple-select", titles: ["Red", "Green"], reserved } })), foundLookup(9n));
    expect(optionLines()).toEqual([
      `Option 0 - ${REFUSED_RULING_TEXT}`,
      `Option 1 - ${NONE_OF_THE_OPTIONS_TEXT}`,
      "Red",
      "Green",
      "Option 0x5 - Withdrawn",
      "Option 0x9 - Too late",
    ]);
    expect(screen.getByText("The case's description also lists an answer the contract does not accept, so it is not shown.")).toBeInTheDocument();
  });

  it("counts several left-out reserved answers in the line", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "single-select", titles: ["Yes", "No"], reserved: { "0x3": "Withdrawn", "0x4": "Spam" } } })));
    expect(optionLines()).toHaveLength(3);
    expect(screen.getByText("The case's description also lists 2 answers the contract does not accept, so they are not shown.")).toBeInTheDocument();
  });

  it("leaves out single-select titles past the dispute's number of choices and counts them in the line with the reserved answers", () => {
    const options = { type: "single-select", titles: ["Yes", "No", "Maybe", "Later"], reserved: { "0x3": "Withdrawn", "0x9": "Spam" } } as const;
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: options })), foundLookup(3n));
    expect(optionLines()).toEqual([`Option 0 - ${REFUSED_RULING_TEXT}`, "Option 1 - Yes", "Option 2 - No", "Option 3 - Maybe", "Option 0x3 - Withdrawn"]);
    expect(screen.getByText("The case's description also lists 2 answers the contract does not accept, so they are not shown.")).toBeInTheDocument();
  });

  it("keeps every tickable title of a multiple select whatever the number of choices", () => {
    const options = { type: "multiple-select", titles: ["Red", "Green", "Blue"] } as const;
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: options })), foundLookup(2n));
    expect(optionLines()).toEqual([`Option 0 - ${REFUSED_RULING_TEXT}`, `Option 1 - ${NONE_OF_THE_OPTIONS_TEXT}`, "Red", "Green", "Blue"]);
    expect(screen.queryByText(/does not accept/)).not.toBeInTheDocument();
  });

  it("keeps Answered Too Soon on a dispute whose choices span the whole uint256 range, as a Reality proxy's do, with no line", () => {
    const options = { type: "multiple-select", titles: ["Red", "Blue"], reserved: { [ANSWERED_TOO_SOON]: "Answered Too Soon" } } as const;
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: options })), foundLookup(MAX_UINT256));
    expect(optionLines().at(-1)).toBe("Option 0xffff...ffffff - Answered Too Soon");
    expect(screen.queryByText(/does not accept/)).not.toBeInTheDocument();
  });

  it.each([
    ["while the dispute is read", sectionLoading],
    ["when the dispute could not be read", sectionUnavailable("rpc-error", "The dispute could not be read.")],
  ] as const)("shows every reserved answer the description lists, with no line, %s", (_case, lookup: SectionData<DisputeLookup>) => {
    renderPanel(sectionReady(testOkMetaEvidence({ rulingOptions: { type: "single-select", titles: ["Yes", "No"], reserved: { "0x3": "Withdrawn" } } })), lookup);
    expect(optionLines().at(-1)).toBe("Option 0x3 - Withdrawn");
    expect(screen.queryByText(/does not accept/)).not.toBeInTheDocument();
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
    expect(description).toHaveClass("text-sm", "leading-6", "whitespace-pre-line");
    expect(description?.className).not.toMatch(/(^|\s)max-w-/);
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
    expect(list).toHaveClass("[list-style-type:'']");
    expect(list).not.toHaveAttribute("role");
  });

  it("labels the options section by its heading and keeps the Court note last", () => {
    renderPanel(sectionReady(testOkMetaEvidence({ question: "Who wins?", rulingOptions: { type: "single-select", titles: ["Yes"] } })));
    const heading = screen.getByRole("heading", { level: 3, name: "Voting options" });
    const section = heading.closest("section");
    if (section === null) throw new Error("The options section is missing");
    expect(section).toHaveAttribute("aria-labelledby", heading.id);
    const note = screen.getByRole("link", { name: "Court" }).closest("p");
    expect(section.lastElementChild).toBe(note);
    expect(note?.querySelector("svg")).toBeNull();
    expect(note?.querySelector("img")).toBeNull();
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
});
