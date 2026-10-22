import type { Period } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import type { CaseDispute, CaseWriteContext, SectionData } from "../../data";
import { sectionLoading, sectionReady, sectionUnavailable, testFamily, testFoundLookup, testWriteContext } from "../../test/data";
import { submitControl } from "./submitControl";

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
    appealDecisions: sectionLoading,
    courts: sectionLoading,
    appealPanel: sectionLoading,
    write,
  };
}

describe("submitControl", () => {
  it.each([0, 1, 2, 3] as const)("offers submission in period %i for a compatible arbitrable", (period) => {
    const context = testWriteContext();
    expect(submitControl(dispute(period, sectionReady(context)))).toEqual({ kind: "available", context });
  });

  it("no submit control in the execution period", () => {
    expect(submitControl(dispute(4, sectionReady(testWriteContext())))).toEqual({ kind: "hidden" });
  });

  it("no submit control without a found dispute", () => {
    expect(submitControl({ ...dispute(0, sectionReady(testWriteContext())), lookup: sectionReady({ status: "not-found" }) })).toEqual({ kind: "hidden" });
    expect(submitControl({ ...dispute(0, sectionReady(testWriteContext())), lookup: sectionLoading })).toEqual({ kind: "hidden" });
  });

  it("an arbitrable without an evidence dialect is view-only", () => {
    const family = testFamily({ family: "view-only", capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } } });
    expect(submitControl(dispute(0, sectionReady(testWriteContext({ family }))))).toEqual({ kind: "view-only" });
  });

  it("an unresolved local ID is view-only", () => {
    expect(submitControl(dispute(0, sectionReady(testWriteContext({ localId: { kind: "unresolved", reason: "reverted" } }))))).toEqual({ kind: "view-only" });
  });

  it("a governor with submitEvidence(string) needs no local ID", () => {
    const family = testFamily({ family: "governor", capabilities: { localId: "none", evidence: { kind: "uri-only" }, appeal: { kind: "governor" }, withdraw: { kind: "none" } } });
    expect(submitControl(dispute(1, sectionReady(testWriteContext({ family, localId: { kind: "not-applicable" } })))).kind).toBe("available");
  });

  it("a failed write context read is unavailable with its reason, never view-only", () => {
    expect(submitControl(dispute(0, sectionUnavailable("rpc-error", "The RPC request timed out.")))).toEqual({
      kind: "unavailable",
      error: { code: "rpc-error", message: "The RPC request timed out." },
    });
  });

  it("loading waits for the write context", () => {
    expect(submitControl(dispute(0, sectionLoading))).toEqual({ kind: "loading" });
  });

  it("a missing Dispute event does not hide submission", () => {
    const control = submitControl(dispute(0, sectionReady(testWriteContext()), sectionUnavailable("not-found", "No Dispute event")));
    expect(control.kind).toBe("available");
  });
});
