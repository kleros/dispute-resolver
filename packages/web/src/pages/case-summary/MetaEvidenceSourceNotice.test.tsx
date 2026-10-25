import type { MetaEvidenceResult, MetaEvidenceSource } from "@dispute-resolver/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CaseDispute, SectionData } from "../../data";
import { TestDataProvider, sectionLoading, sectionReady, sectionUnavailable, testCaseDispute, testChain, testOkMetaEvidence } from "../../test/data";
import { testMetaEvidence } from "../../test/safe-content";
import { MetaEvidenceSourceNotice } from "./index";

const TITLE_DIFFERENT_FILE = "The meta-evidence API pointed to a different file than the one recorded on-chain";
const TITLE_UNVERIFIABLE = "The meta-evidence API pointed to a file that cannot be verified";
const BODY_DIFFERENT_FILE =
  "This page shows the meta-evidence file the arbitrable contract recorded on-chain. Other interfaces may show the other file's details, and the Ongoing Disputes list may show its title.";
const BODY_UNVERIFIABLE = "This page shows the meta-evidence file the arbitrable contract recorded on-chain. Other interfaces may show different details for this dispute.";
const LOCATOR_PATH = "/ipfs/QmPMaPsRbEQ4Z65GqiBnGEqQNnGQBZX2BuMW9AEXqtit9f/metaEvidence.json";

const GNOSIS = testChain(100);

/** Gnosis dispute 460 with only its meta-evidence read, the one section this notice depends on. */
function caseDispute(metaEvidence: SectionData<MetaEvidenceResult>): CaseDispute {
  return testCaseDispute({ chainId: 100, disputeId: 460n, metaEvidence });
}

function withSource(source: MetaEvidenceSource): SectionData<MetaEvidenceResult> {
  return sectionReady({ ...testOkMetaEvidence(), source });
}

function notice(metaEvidence: SectionData<MetaEvidenceResult>) {
  return (
    <TestDataProvider>
      <MetaEvidenceSourceNotice dispute={caseDispute(metaEvidence)} chain={GNOSIS} />
    </TestDataProvider>
  );
}

function renderNotice(metaEvidence: SectionData<MetaEvidenceResult>) {
  return render(notice(metaEvidence));
}

/** The silent region: present, empty, the only element, and boxless (`display: contents`). */
function expectSilentRegion(container: HTMLElement): void {
  const region = screen.getByRole("status");
  expect(region).toBeEmptyDOMElement();
  expect(container.firstElementChild).toBe(region);
  expect(container.childElementCount).toBe(1);
  expect(region).toHaveClass("contents");
}

describe("MetaEvidenceSourceNotice", () => {
  it("a meta-evidence the meta-evidence API disagrees with shows the warning as a polite status, not an alert", () => {
    const { container } = renderNotice(withSource({ kind: "event", locator: "disagrees", locatorPath: LOCATOR_PATH }));
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent(TITLE_DIFFERENT_FILE);
    expect(region).toHaveTextContent(BODY_DIFFERENT_FILE);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).not.toContain("/ipfs/");
  });

  it("an API answer that is not content-addressed shows the warning with the unverifiable-file wording", () => {
    const { container } = renderNotice(withSource({ kind: "event", locator: "disagrees", locatorPath: null }));
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent(TITLE_UNVERIFIABLE);
    expect(region).toHaveTextContent(BODY_UNVERIFIABLE);
    expect(container.textContent).not.toContain("Ongoing Disputes");
  });

  it("agreement, a missing or failed API answer, and an API-decided meta-evidence show no warning", () => {
    const sources: MetaEvidenceSource[] = [
      { kind: "event", locator: "agrees", locatorPath: LOCATOR_PATH },
      { kind: "event", locator: "missing", locatorPath: null },
      { kind: "event", locator: "unavailable", locatorPath: null },
      { kind: "locator", event: "not-read" },
      { kind: "locator", event: "dispute-event-not-found" },
      { kind: "locator", event: "dispute-event-ambiguous" },
      { kind: "locator", event: "meta-evidence-event-not-found" },
      { kind: "locator", event: "unavailable" },
    ];
    for (const source of sources) {
      const { container, unmount } = renderNotice(withSource(source));
      expectSilentRegion(container);
      unmount();
    }
  });

  it("no warning while the meta-evidence loads, or when it is unavailable, missing, failed or rejected", () => {
    const states: SectionData<MetaEvidenceResult>[] = [
      sectionLoading,
      sectionUnavailable("rpc-error"),
      sectionReady({ status: "missing" }),
      sectionReady({ status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "gateway down" } }),
      sectionReady({ status: "invalid", metaEvidence: testMetaEvidence(), reason: "uri-not-content-addressed" }),
    ];
    for (const state of states) {
      const { container, unmount } = renderNotice(state);
      expectSilentRegion(container);
      unmount();
    }
  });

  it("the status region exists before the comparison settles, so the warning is an addition to it, not a new region", () => {
    const { rerender } = renderNotice(sectionLoading);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    rerender(notice(withSource({ kind: "event", locator: "disagrees", locatorPath: LOCATOR_PATH })));
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent(TITLE_DIFFERENT_FILE);

    rerender(notice(withSource({ kind: "event", locator: "agrees", locatorPath: LOCATOR_PATH })));
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toBeEmptyDOMElement();
  });
});
