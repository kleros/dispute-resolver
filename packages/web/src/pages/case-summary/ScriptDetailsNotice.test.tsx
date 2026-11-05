import type { MetaEvidenceResult } from "@dispute-resolver/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CaseDispute, SectionData } from "../../data";
import { sectionLoading, sectionReady, sectionUnavailable, testCaseDispute, testChain, testOkMetaEvidence } from "../../test/data";
import { testMetaEvidence } from "../../test/safe-content";
import { ScriptDetailsNotice } from "./index";

const TITLE = "Details from the arbitrable's script are unavailable";
const BODY =
  "This dispute's arbitrable adds details through a script, which could not be used. The page shows the details recorded in the dispute's meta-evidence, so some of them may be incomplete.";

const MAINNET = testChain(1);

type ScriptOutcome = Extract<MetaEvidenceResult, { status: "ok" }>["script"];

function caseDispute(metaEvidence: SectionData<MetaEvidenceResult>): CaseDispute {
  return testCaseDispute({ metaEvidence });
}

function withScript(script: ScriptOutcome): SectionData<MetaEvidenceResult> {
  return sectionReady({ ...testOkMetaEvidence({ dynamicScriptURI: "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj" }), script });
}

function renderNotice(metaEvidence: SectionData<MetaEvidenceResult>) {
  return render(<ScriptDetailsNotice dispute={caseDispute(metaEvidence)} chain={MAINNET} />);
}

function expectOneNeutralNotice(container: HTMLElement): void {
  expect(screen.getAllByText(TITLE)).toHaveLength(1);
  expect(screen.getAllByText(BODY)).toHaveLength(1);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(container.textContent).not.toMatch(/configur|RPC|REACT_APP|env|deploy|chain ID/i);
}

describe("ScriptDetailsNotice", () => {
  it.each(["script-chain-unavailable", "script-fetch-failed"] as const)("shows one neutral notice when the script was skipped (%s)", (reason) => {
    const { container } = renderNotice(withScript({ ran: false, reason }));
    expectOneNeutralNotice(container);
  });

  it("shows nothing for a script that ran, a registered Reality proxy or no script", () => {
    const silent: SectionData<MetaEvidenceResult>[] = [
      withScript({ ran: true, kind: "standard", jsonDuplicateKeys: false }),
      withScript({ ran: true, kind: "reality", jsonDuplicateKeys: true }),
      withScript({ ran: false, reason: "registered-reality-proxy" }),
      withScript({ ran: false, reason: "no-script" }),
      sectionLoading,
      sectionUnavailable("rpc-error"),
      sectionReady({ status: "failed", reason: "not-json", error: { code: "invalid-data", message: "The meta-evidence file is not JSON." } }),
      sectionReady({ status: "invalid", metaEvidence: testMetaEvidence(), reason: "script-not-allowlisted" }),
      sectionReady({ status: "missing" }),
    ];
    for (const metaEvidence of silent) {
      const { container, unmount } = renderNotice(metaEvidence);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
