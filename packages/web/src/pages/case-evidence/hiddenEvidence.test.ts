import type { EvidenceList, HiddenEvidenceReason } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { HIDDEN_REASON_LABELS, hiddenEvidenceText } from "./hiddenEvidence";

const NONE: Readonly<Record<HiddenEvidenceReason, number>> = { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 };

function list(hidden: Partial<Record<HiddenEvidenceReason, number>>): EvidenceList {
  const hiddenByReason = { ...NONE, ...hidden };
  const hiddenEvidenceCount = Object.values(hiddenByReason).reduce((sum, count) => sum + count, 0);
  return { items: [], hiddenEvidenceCount, hiddenByReason };
}

describe("hiddenEvidenceText", () => {
  it("nothing hidden has no text", () => {
    expect(hiddenEvidenceText(list({}))).toBeNull();
  });

  it("a single reason follows the total without its own count", () => {
    expect(hiddenEvidenceText(list({ "not-content-addressed": 2 }))).toBe("2 evidence items hidden: not content-addressed");
  });

  it("a single hidden item is singular", () => {
    expect(hiddenEvidenceText(list({ "fetch-failed": 1 }))).toBe("1 evidence item hidden: could not be fetched");
  });

  it("several reasons are counted one by one", () => {
    expect(hiddenEvidenceText(list({ undecodable: 1, "not-json": 2, "schema-invalid": 1 }))).toBe(
      "4 evidence items hidden: 1 undecodable event log, 2 not valid JSON, 1 not a valid evidence document",
    );
  });

  it.each(Object.keys(NONE) as HiddenEvidenceReason[])("labels the %s reason", (reason) => {
    expect(HIDDEN_REASON_LABELS[reason]).toMatch(/\S/);
    expect(hiddenEvidenceText(list({ [reason]: 3 }))).toBe(`3 evidence items hidden: ${HIDDEN_REASON_LABELS[reason]}`);
  });
});
