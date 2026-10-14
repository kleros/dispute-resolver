import { buildDisputeView, type DisputeView, type MetaEvidenceResult } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import type { CaseDispute } from "../../data";
import { sectionLoading, sectionReady, sectionUnavailable, testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence, TEST_ARBITRABLE } from "../../test/data";
import { casePageHook } from "./pageState";

const FOUND = testFoundLookup({ disputeId: 7n, period: 3 });

function existingView(metaEvidence: MetaEvidenceResult | null = testOkMetaEvidence(), evidence: "local-id" | "none" = "local-id"): DisputeView {
  const family = testFamily({ capabilities: { ...testFamily().capabilities, evidence: { kind: evidence } } });
  return buildDisputeView({
    lookup: FOUND,
    reads: testDetails(FOUND),
    family: { ok: true, value: family },
    courts: { ok: true, value: [testCourt()] },
    metaEvidence,
    fundedRulings: null,
  });
}

function caseDispute(overrides: Partial<CaseDispute> = {}): CaseDispute {
  return {
    status: "dispute",
    chainId: 1,
    disputeId: 7n,
    lookup: sectionReady(FOUND),
    view: sectionLoading,
    family: sectionLoading,
    metaEvidence: sectionLoading,
    disputeEvent: sectionLoading,
    evidence: sectionLoading,
    courts: sectionLoading,
    appealPanel: sectionLoading,
    write: sectionLoading,
    ...overrides,
  };
}

describe("casePageHook (§12.1)", () => {
  it("§12.1: the page is loading while the lookup runs, with nothing else written", () => {
    expect(casePageHook(caseDispute({ lookup: sectionLoading }))).toEqual({ state: "loading" });
  });

  it("D-53: a lookup that found no dispute is the not-found state", () => {
    expect(casePageHook(caseDispute({ lookup: sectionReady({ status: "not-found" }) }))).toEqual({ state: "not-found" });
  });

  it("spec 5.4: a chain whose arbitrator is missing is the no-arbitrator state", () => {
    expect(casePageHook(caseDispute({ lookup: sectionReady({ status: "no-arbitrator" }) }))).toEqual({ state: "no-arbitrator" });
  });

  it("D-36: a lookup that failed in transport is unavailable, not 'does not exist'", () => {
    expect(casePageHook(caseDispute({ lookup: sectionUnavailable("rpc-error") }))).toEqual({ state: "unavailable" });
    expect(casePageHook(caseDispute({ lookup: sectionReady({ status: "unavailable", error: { code: "rpc-error", message: "down" } }) }))).toEqual({ state: "unavailable" });
  });

  it("S-4: a found dispute writes its arbitrable, period and last period change before the view settles", () => {
    expect(casePageHook(caseDispute())).toEqual({
      state: "dispute",
      arbitrable: TEST_ARBITRABLE,
      family: null,
      period: 3,
      lastPeriodChange: FOUND.dispute.lastPeriodChange,
      compatibility: null,
      realityNotice: null,
    });
  });

  it("§12.1: a settled dispute writes its family, compatibility and Reality notice", () => {
    const hook = casePageHook(caseDispute({ family: sectionReady(testFamily({ family: "idr-v1" })), view: sectionReady(existingView()) }));
    expect(hook).toMatchObject({ state: "dispute", family: "idr-v1", compatibility: "full", realityNotice: "none" });
  });

  it("spec 5.5: a family that cannot take evidence is view-only", () => {
    expect(casePageHook(caseDispute({ view: sectionReady(existingView(testOkMetaEvidence(), "none")) }))).toMatchObject({ compatibility: "view-only" });
  });

  it("D-36: a family that could not be detected is written as unknown", () => {
    expect(casePageHook(caseDispute({ family: sectionUnavailable("rpc-error") }))).toMatchObject({ family: "unknown" });
  });
});
