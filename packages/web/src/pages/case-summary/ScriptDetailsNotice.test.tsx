import { getChain, type ChainConfig, type MetaEvidenceResult } from "@dispute-resolver/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CaseDispute, SectionData } from "../../data";
import { sectionLoading, sectionReady, sectionUnavailable, testOkMetaEvidence } from "../../test/data";
import { testMetaEvidence } from "../../test/safe-content";
import { ScriptDetailsNotice } from "./index";

const TITLE = "Details from the arbitrable's script are unavailable";
const BODY =
  "This dispute's arbitrable adds details through a script, which could not be used. The page shows the details recorded in the dispute's meta-evidence, so some of them may be incomplete.";

function mainnet(): ChainConfig {
  const chain = getChain(1);
  if (chain === undefined) throw new Error("Mainnet is not configured");
  return chain;
}

const MAINNET = mainnet();

type ScriptOutcome = Extract<MetaEvidenceResult, { status: "ok" }>["script"];

/** Mainnet dispute 1 with only its meta-evidence read, the one section this notice depends on. */
function caseDispute(metaEvidence: SectionData<MetaEvidenceResult>): CaseDispute {
  return {
    status: "dispute",
    chainId: 1,
    disputeId: 1n,
    lookup: sectionLoading,
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
  it("shows one neutral notice when the script was skipped for its chain", () => {
    const { container } = renderNotice(withScript({ ran: false, reason: "script-chain-unavailable" }));
    expectOneNeutralNotice(container);
  });

  it("shows it for a script that could not be fetched", () => {
    const { container } = renderNotice(withScript({ ran: false, reason: "script-fetch-failed" }));
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
