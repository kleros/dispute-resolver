import { NONE_OF_THE_OPTIONS_TEXT, REFUSED_RULING_TEXT, type RulingOptions } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { shortenRulingCode, votingOptions } from "./votingOptions";

const MAX_UINT = `0x${"f".repeat(64)}`;
const REFUSED = `Option 0 - ${REFUSED_RULING_TEXT}`;
const NONE = `Option 1 - ${NONE_OF_THE_OPTIONS_TEXT}`;

/** Each option as the list item reads: "{code} - {title}", or the title alone, then ": {description}" when one is defined. */
function votingOptionLines(options: RulingOptions): readonly string[] | null {
  return (
    votingOptions(options)?.map((option) => {
      const label = option.code === undefined ? option.title : `${option.code} - ${option.title}`;
      return (option.description === undefined ? label : `${label}: ${option.description}`).trimEnd();
    }) ?? null
  );
}

describe("voting options", () => {
  it("only the select types list voting options", () => {
    expect(votingOptions({ type: "single-select", titles: ["Yes"] })).not.toBeNull();
    expect(votingOptions({ type: "multiple-select", titles: ["A"] })).not.toBeNull();
    for (const type of ["uint", "int", "string", "datetime", "hash", "bool"]) {
      expect(votingOptions({ type, titles: ["Yes"] })).toBeNull();
    }
  });

  it("a select question without titles lists option 0 only", () => {
    expect(votingOptionLines({ type: "single-select" })).toEqual([REFUSED]);
  });

  it("a positional description follows its title only when it is defined", () => {
    expect(votingOptionLines({ type: "single-select", titles: ["Yes", "No", "Maybe"], descriptions: ["Pay the seller", ""] })).toEqual([
      REFUSED,
      "Option 1 - Yes: Pay the seller",
      "Option 2 - No:",
      "Option 3 - Maybe",
    ]);
  });

  it("descriptions keyed by position as a record are found by position", () => {
    expect(votingOptionLines({ type: "single-select", titles: ["Yes", "No"], descriptions: { "1": "Refund the buyer" } })).toEqual([
      REFUSED,
      "Option 1 - Yes",
      "Option 2 - No: Refund the buyer",
    ]);
  });

  it("reserved options follow the titles, with codes longer than 12 characters shortened", () => {
    expect(votingOptionLines({ type: "single-select", titles: ["Yes"], reserved: { [MAX_UINT]: "Answered Too Soon", "0x01": "Short code" } })).toEqual([
      REFUSED,
      "Option 1 - Yes",
      "Option 0xffff...ffffff - Answered Too Soon",
      "Option 0x01 - Short code",
    ]);
  });

  it("a reserved option takes its description by code", () => {
    expect(votingOptionLines({ type: "single-select", titles: [], reserved: { [MAX_UINT]: "Answered Too Soon" }, descriptions: { [MAX_UINT]: "Asked too early" } })).toEqual([
      REFUSED,
      "Option 0xffff...ffffff - Answered Too Soon: Asked too early",
    ]);
  });

  it("a positional description list never describes a hex reserved code", () => {
    expect(votingOptionLines({ type: "single-select", titles: ["Yes"], reserved: { "0x01": "Short code" }, descriptions: ["First"] })).toEqual([
      REFUSED,
      "Option 1 - Yes: First",
      "Option 0x01 - Short code",
    ]);
  });

  it("a description record never reaches inherited properties", () => {
    expect(votingOptionLines({ type: "single-select", titles: [], reserved: { constructor: "Odd code" }, descriptions: {} })).toEqual([REFUSED, "Option constructor - Odd code"]);
  });

  it("every option has a distinct key, even when a title repeats", () => {
    const options = votingOptions({ type: "multiple-select", titles: ["A", "A"], reserved: { "0x1": "A" } }) ?? [];
    expect(new Set(options.map((option) => option.key)).size).toBe(options.length);
  });
});

describe("voting options of a multiple-select", () => {
  it("lists option 0, then option 1 for no option ticked, then each title as a box without a code, described by position", () => {
    expect(votingOptionLines({ type: "multiple-select", titles: ["Red", "Green", "Blue"], descriptions: ["The red one", "", "The blue one"] })).toEqual([
      REFUSED,
      NONE,
      "Red: The red one",
      "Green:",
      "Blue: The blue one",
    ]);
    const titles = votingOptions({ type: "multiple-select", titles: ["Red", "Green"] })?.slice(2) ?? [];
    expect(titles.map((option) => option.code)).toEqual([undefined, undefined]);
  });

  it("reserved options follow the titles with their codes", () => {
    expect(votingOptionLines({ type: "multiple-select", titles: ["Red"], reserved: { [MAX_UINT]: "Answered Too Soon" }, descriptions: { [MAX_UINT]: "Asked too early" } })).toEqual(
      [REFUSED, NONE, "Red", "Option 0xffff...ffffff - Answered Too Soon: Asked too early"],
    );
  });

  it("a title written None or None of the options stays a title beside option 1", () => {
    expect(votingOptionLines({ type: "multiple-select", titles: ["None", NONE_OF_THE_OPTIONS_TEXT, "None"] })).toEqual([REFUSED, NONE, "None", NONE_OF_THE_OPTIONS_TEXT, "None"]);
  });

  it("an empty title list still lists option 1 for nothing ticked", () => {
    expect(votingOptionLines({ type: "multiple-select", titles: [], reserved: { [MAX_UINT]: "Answered Too Soon" } })).toEqual([
      REFUSED,
      NONE,
      "Option 0xffff...ffffff - Answered Too Soon",
    ]);
  });

  it("without a title list it lists option 0 and its reserved options only", () => {
    expect(votingOptionLines({ type: "multiple-select" })).toEqual([REFUSED]);
    expect(votingOptionLines({ type: "multiple-select", reserved: { [MAX_UINT]: "Answered Too Soon" } })).toEqual([REFUSED, "Option 0xffff...ffffff - Answered Too Soon"]);
  });

  it("a single-select keeps coding title i as option i + 1 and lists no option for nothing ticked", () => {
    expect(votingOptionLines({ type: "single-select", titles: ["Red", "Green"] })).toEqual([REFUSED, "Option 1 - Red", "Option 2 - Green"]);
  });
});

describe("shortenRulingCode", () => {
  it("keeps codes of at most 12 characters", () => {
    expect(shortenRulingCode("0x0123456789")).toBe("0x0123456789");
    expect(shortenRulingCode("0x0123456789a")).toBe("0x0123...56789a");
  });
});
