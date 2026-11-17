import type { Period } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import type { CaseDispute, CaseWriteContext, SectionData } from "../../data";
import { sectionLoading, sectionReady, testCaseDispute, testFoundLookup, testWriteContext } from "../../test/data";
import { submitControl } from "./submitControl";

function dispute(period: Period, write: SectionData<CaseWriteContext>): CaseDispute {
  return testCaseDispute({ lookup: sectionReady(testFoundLookup({ period })), write });
}

describe("submitControl", () => {
  it.each([0, 1, 2, 3] as const)("offers submission in period %i for a compatible arbitrable", (period) => {
    const context = testWriteContext();
    expect(submitControl(dispute(period, sectionReady(context)))).toEqual({ kind: "available", context });
  });

  it("no submit control without a found dispute", () => {
    expect(submitControl({ ...dispute(0, sectionReady(testWriteContext())), lookup: sectionReady({ status: "not-found" }) })).toEqual({ kind: "hidden" });
    expect(submitControl({ ...dispute(0, sectionReady(testWriteContext())), lookup: sectionLoading })).toEqual({ kind: "hidden" });
  });

  it("an unresolved local ID is view-only", () => {
    expect(submitControl(dispute(0, sectionReady(testWriteContext({ localId: { kind: "unresolved", reason: "reverted" } }))))).toEqual({ kind: "view-only" });
  });

  it("loading waits for the write context", () => {
    expect(submitControl(dispute(0, sectionLoading))).toEqual({ kind: "loading" });
  });
});
