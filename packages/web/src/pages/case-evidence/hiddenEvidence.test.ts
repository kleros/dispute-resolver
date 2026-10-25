import type { EvidenceList, HiddenEvidenceReason } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { testEvidenceList } from "../../test/data";
import { HIDDEN_REASON_LABELS, hiddenEvidenceText } from "./hiddenEvidence";

function list(hidden: Partial<Record<HiddenEvidenceReason, number>>): EvidenceList {
  return testEvidenceList([], hidden);
}

describe("hiddenEvidenceText", () => {
  it("nothing hidden has no text", () => {
    expect(hiddenEvidenceText(list({}))).toBeNull();
  });

  it("a single hidden item is singular", () => {
    expect(hiddenEvidenceText(list({ "fetch-failed": 1 }))).toBe("1 evidence item hidden: could not be fetched");
  });

  it("several reasons are counted one by one", () => {
    expect(hiddenEvidenceText(list({ undecodable: 1, "not-json": 2, "schema-invalid": 1 }))).toBe(
      "4 evidence items hidden: 1 undecodable event log, 2 not valid JSON, 1 not a valid evidence document",
    );
  });

  it.each(Object.keys(HIDDEN_REASON_LABELS) as HiddenEvidenceReason[])("labels the %s reason", (reason) => {
    expect(HIDDEN_REASON_LABELS[reason]).toMatch(/\S/);
    expect(hiddenEvidenceText(list({ [reason]: 3 }))).toBe(`3 evidence items hidden: ${HIDDEN_REASON_LABELS[reason]}`);
  });
});
