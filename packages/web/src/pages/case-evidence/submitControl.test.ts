import type { Period } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import type { CaseDispute, CaseWriteContext, SectionData } from "../../data";
import { sectionLoading, sectionReady, sectionUnavailable, testFamily, testFoundLookup } from "../../test/data";
import { submitControl } from "./submitControl";

function writeContext(overrides: Partial<CaseWriteContext> = {}): CaseWriteContext {
  const lookup = testFoundLookup();
  return { binding: lookup.binding, family: testFamily(), localId: { kind: "local-id", value: 7n }, override: undefined, appealInfo: null, ...overrides };
}

function dispute(period: Period, write: SectionData<CaseWriteContext>, evidence: CaseDispute["evidence"] = sectionLoading): CaseDispute {
  return {
    status: "dispute",
    chainId: 1,
    disputeId: 1n,
    lookup: sectionReady(testFoundLookup({ period })),
    view: sectionLoading,
    family: sectionLoading,
    metaEvidence: sectionLoading,
    disputeEvent: sectionLoading,
    evidence,
    courts: sectionLoading,
    appealPanel: sectionLoading,
    write,
  };
}

describe("submitControl (spec 5.14)", () => {
  it.each([0, 1, 2, 3] as const)("spec 5.14: offers submission in period %i for a compatible arbitrable", (period) => {
    const context = writeContext();
    expect(submitControl(dispute(period, sectionReady(context)))).toEqual({ kind: "available", context });
  });

  it("spec 5.14: no submit control in the execution period", () => {
    expect(submitControl(dispute(4, sectionReady(writeContext())))).toEqual({ kind: "hidden" });
  });

  it("spec 5.14: no submit control without a found dispute", () => {
    expect(submitControl({ ...dispute(0, sectionReady(writeContext())), lookup: sectionReady({ status: "not-found" }) })).toEqual({ kind: "hidden" });
    expect(submitControl({ ...dispute(0, sectionReady(writeContext())), lookup: sectionLoading })).toEqual({ kind: "hidden" });
  });

  it("spec 5.14: an arbitrable without an evidence dialect is view-only", () => {
    const family = testFamily({ family: "view-only", capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } } });
    expect(submitControl(dispute(0, sectionReady(writeContext({ family }))))).toEqual({ kind: "view-only" });
  });

  it("spec 5.14: an unresolved local ID is view-only", () => {
    expect(submitControl(dispute(0, sectionReady(writeContext({ localId: { kind: "unresolved", reason: "reverted" } }))))).toEqual({ kind: "view-only" });
  });

  it("spec 5.14: a governor with submitEvidence(string) needs no local ID", () => {
    const family = testFamily({ family: "governor", capabilities: { localId: "none", evidence: { kind: "uri-only" }, appeal: { kind: "governor" }, withdraw: { kind: "none" } } });
    expect(submitControl(dispute(1, sectionReady(writeContext({ family, localId: { kind: "not-applicable" } })))).kind).toBe("available");
  });

  it("CE-2, D-36: a failed write context read is unavailable with its reason, never view-only", () => {
    expect(submitControl(dispute(0, sectionUnavailable("rpc-error", "The RPC request timed out.")))).toEqual({
      kind: "unavailable",
      error: { code: "rpc-error", message: "The RPC request timed out." },
    });
  });

  it("D-36: loading waits for the write context", () => {
    expect(submitControl(dispute(0, sectionLoading))).toEqual({ kind: "loading" });
  });

  it("S-5: a missing Dispute event does not hide submission", () => {
    const control = submitControl(dispute(0, sectionReady(writeContext()), sectionUnavailable("not-found", "No Dispute event")));
    expect(control.kind).toBe("available");
  });
});
