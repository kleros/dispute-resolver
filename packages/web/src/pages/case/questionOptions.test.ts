import { describe, expect, it } from "vitest";
import type { RulingOptions } from "@dispute-resolver/core";
import { questionTypeLabel, shortenRulingCode, votingOptions } from "./questionOptions";

const MAX_UINT = `0x${"f".repeat(64)}`;

/** Each option as the panel's list item reads: the label, then ": {description}" when one is defined. */
function votingOptionLines(options: RulingOptions): readonly string[] | null {
  return votingOptions(options)?.map((option) => (option.description === undefined ? option.label : `${option.label}: ${option.description}`).trimEnd()) ?? null;
}

describe("question type labels (spec 5.13)", () => {
  it.each([
    ["single-select", "Multiple choice: single select"],
    ["multiple-select", "Multiple choice: multiple select"],
    ["uint", "Non-negative number"],
    ["int", "Number"],
    ["string", "Text"],
    ["datetime", "Date"],
    ["hash", "Hash"],
  ])("spec 5.13: labels %s as %s", (type, label) => {
    expect(questionTypeLabel(type)).toBe(label);
  });

  it("spec 5.13: an unknown type has no label, as today", () => {
    expect(questionTypeLabel("bool")).toBeNull();
    expect(questionTypeLabel("")).toBeNull();
  });
});

describe("voting options (spec 5.13)", () => {
  it("spec 5.13: only the select types list voting options", () => {
    expect(votingOptions({ type: "single-select", titles: ["Yes"] })).not.toBeNull();
    expect(votingOptions({ type: "multiple-select", titles: ["A"] })).not.toBeNull();
    for (const type of ["uint", "int", "string", "datetime", "hash", "bool"]) {
      expect(votingOptions({ type, titles: ["Yes"] })).toBeNull();
    }
  });

  it("spec 5.13: starts with option 0 and numbers the titles from 1", () => {
    expect(votingOptionLines({ type: "single-select", titles: ["Yes", "No"] })).toEqual(["Option 0 - Refuse to Arbitrate / Invalid", "Option 1 - Yes", "Option 2 - No"]);
  });

  it("spec 5.13: a select question without titles lists option 0 only", () => {
    expect(votingOptionLines({ type: "single-select" })).toEqual(["Option 0 - Refuse to Arbitrate / Invalid"]);
  });

  it("spec 5.13: a positional description follows its title only when it is defined", () => {
    expect(votingOptionLines({ type: "single-select", titles: ["Yes", "No", "Maybe"], descriptions: ["Pay the seller", ""] })).toEqual([
      "Option 0 - Refuse to Arbitrate / Invalid",
      "Option 1 - Yes: Pay the seller",
      "Option 2 - No:",
      "Option 3 - Maybe",
    ]);
  });

  it("spec 5.13: descriptions keyed by position as a record are found by position", () => {
    expect(votingOptionLines({ type: "single-select", titles: ["Yes", "No"], descriptions: { "1": "Refund the buyer" } })).toEqual([
      "Option 0 - Refuse to Arbitrate / Invalid",
      "Option 1 - Yes",
      "Option 2 - No: Refund the buyer",
    ]);
  });

  it("spec 5.13: reserved options follow the titles, with codes longer than 12 characters shortened", () => {
    expect(votingOptionLines({ type: "single-select", titles: ["Yes"], reserved: { [MAX_UINT]: "Answered Too Soon", "0x01": "Short code" } })).toEqual([
      "Option 0 - Refuse to Arbitrate / Invalid",
      "Option 1 - Yes",
      "Option 0xffff...ffffff - Answered Too Soon",
      "Option 0x01 - Short code",
    ]);
  });

  it("spec 5.13: a reserved option takes its description by code", () => {
    expect(votingOptionLines({ type: "single-select", titles: [], reserved: { [MAX_UINT]: "Answered Too Soon" }, descriptions: { [MAX_UINT]: "Asked too early" } })).toEqual([
      "Option 0 - Refuse to Arbitrate / Invalid",
      "Option 0xffff...ffffff - Answered Too Soon: Asked too early",
    ]);
  });

  it("spec 5.13: a positional description list never describes a hex reserved code", () => {
    expect(votingOptionLines({ type: "single-select", titles: ["Yes"], reserved: { "0x01": "Short code" }, descriptions: ["First"] })).toEqual([
      "Option 0 - Refuse to Arbitrate / Invalid",
      "Option 1 - Yes: First",
      "Option 0x01 - Short code",
    ]);
  });

  it("A7: a description record never reaches inherited properties", () => {
    expect(votingOptionLines({ type: "single-select", titles: [], reserved: { constructor: "Odd code" }, descriptions: {} })).toEqual([
      "Option 0 - Refuse to Arbitrate / Invalid",
      "Option constructor - Odd code",
    ]);
  });

  it("spec 5.13: every option has a distinct key, even when a title repeats", () => {
    const options = votingOptions({ type: "multiple-select", titles: ["A", "A"], reserved: { "0x1": "A" } }) ?? [];
    expect(new Set(options.map((option) => option.key)).size).toBe(options.length);
  });
});

describe("shortenRulingCode (spec 5.13)", () => {
  it("spec 5.13: keeps codes of at most 12 characters", () => {
    expect(shortenRulingCode("0x0123456789")).toBe("0x0123456789");
    expect(shortenRulingCode("0x0123456789a")).toBe("0x0123...56789a");
  });
});
