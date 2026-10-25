import { describe, expect, it } from "vitest";
import { INVALID_META_EVIDENCE, parseMetaEvidence } from "./index";
import type { MetaEvidence } from "./types";

const ADDRESS = "0x799cb978dea5d6ca00ccb1794d3c3d4c89e40cd1";
/** The reserved Reality.eth answer "Answered Too Soon", and the same code written in upper case. */
const TOO_SOON = `0x${"f".repeat(64)}`;
const TOO_SOON_UPPER = `0x${"F".repeat(64)}`;
const CHECKSUMMED = "0x799CB978dEa5d6cA00cCB1794D3c3D4c89e40cD1";

function parsed(merged: unknown): MetaEvidence {
  const outcome = parseMetaEvidence(merged);
  if (!outcome.ok) throw new Error(`expected ok, got ${outcome.error.message}`);
  return outcome.value;
}

function rulingOptionsOf(value: unknown): NonNullable<MetaEvidence["rulingOptions"]> {
  const { rulingOptions } = parsed({ title: "Title", rulingOptions: value });
  if (rulingOptions === null) throw new Error("expected ruling options");
  return rulingOptions;
}

describe("rulingOptions", () => {
  it("defaults missing or invalid ruling options", () => {
    expect(rulingOptionsOf(undefined)).toEqual({ type: "single-select", titles: [] });
    expect(rulingOptionsOf("x")).toEqual({ type: "single-select", titles: [] });
    expect(rulingOptionsOf({ titles: ["a"] })).toEqual({ type: "single-select", titles: ["a"] });
  });

  it("coerces titles, reserved answers and precision", () => {
    expect(rulingOptionsOf({ type: "single-select", titles: "a,b" }).titles).toEqual([]);
    expect(rulingOptionsOf({ type: "single-select", titles: [1, { a: 1 }] }).titles).toEqual(["1", "[object Object]"]);
    expect(rulingOptionsOf({ type: "single-select", reserved: [1] })).not.toHaveProperty("reserved");
    expect(rulingOptionsOf({ type: "single-select", reserved: { "0x5": 2 } }).reserved).toEqual({ "0x5": "2" });
    expect(rulingOptionsOf({ type: "uint", precision: "x" })).not.toHaveProperty("precision");
    expect(rulingOptionsOf({ type: "uint", precision: 18 }).precision).toBe(18);
  });

  it("a hexadecimal precision is read as reality-eth-lib reads it", () => {
    expect(rulingOptionsOf({ type: "uint", precision: "0x12" }).precision).toBe(18);
    expect(rulingOptionsOf({ type: "uint", precision: " 0X12 " }).precision).toBe(18);
  });

  it("a non-object (null, array, number) becomes the empty single-select", () => {
    for (const value of [null, [], ["a"], 5, true]) expect(rulingOptionsOf(value)).toEqual({ type: "single-select", titles: [] });
  });

  it("a non-string type becomes single-select and an unknown type string is kept verbatim", () => {
    expect(rulingOptionsOf({ type: 3, titles: ["a"] }).type).toBe("single-select");
    expect(rulingOptionsOf({ type: "ranked-choice" }).type).toBe("ranked-choice");
  });

  it("titles are left absent when absent, and reserved and precision are dropped only when unusable", () => {
    expect(rulingOptionsOf({ type: "uint" })).toEqual({ type: "uint" });
    expect(rulingOptionsOf({ type: "uint", precision: Number.POSITIVE_INFINITY })).toEqual({ type: "uint" });
    expect(rulingOptionsOf({ type: "uint", reserved: null })).toEqual({ type: "uint" });
  });

  it("keeps a precision of 0 and reads a numeric string precision as its number", () => {
    expect(rulingOptionsOf({ type: "uint", precision: 0 }).precision).toBe(0);
    expect(rulingOptionsOf({ type: "uint", precision: "6" }).precision).toBe(6);
  });

  it("reads precision as reality-eth-lib does, so the precision shown is the one encoded", () => {
    expect(rulingOptionsOf({ type: "uint", precision: true }).precision).toBe(0);
    expect(rulingOptionsOf({ type: "uint", precision: "1e2" }).precision).toBe(1);
    expect(rulingOptionsOf({ type: "uint", precision: 2.7 }).precision).toBe(2);
    expect(rulingOptionsOf({ type: "uint", precision: -3 }).precision).toBe(0);
  });

  it("removes a precision that would encode with the default 18 (null, false, empty, or not a finite number)", () => {
    for (const precision of [null, false, "", "1_000"]) expect(rulingOptionsOf({ type: "uint", precision })).toEqual({ type: "uint" });
  });

  it("descriptions become strings; a value that is neither an array nor an object is removed", () => {
    expect(rulingOptionsOf({ type: "single-select", titles: ["a"], descriptions: ["first", 2] }).descriptions).toEqual(["first", "2"]);
    for (const descriptions of ["first", 3, true, null]) expect(rulingOptionsOf({ type: "single-select", descriptions })).not.toHaveProperty("descriptions");
  });

  it("descriptions keyed by reserved answer code are kept", () => {
    const options = rulingOptionsOf({
      type: "single-select",
      titles: ["Yes", "No"],
      reserved: { [TOO_SOON]: "Answered Too Soon" },
      descriptions: { [TOO_SOON]: "The observation period has not ended" },
    });
    expect(options).toEqual({
      type: "single-select",
      titles: ["Yes", "No"],
      reserved: { [TOO_SOON]: "Answered Too Soon" },
      descriptions: { [TOO_SOON]: "The observation period has not ended" },
    });
  });

  it("an object of descriptions serves positions and reserved codes, keys as written, values as strings", () => {
    const descriptions = { "0": "First option", "1": 2, "0xFF": false, [TOO_SOON_UPPER]: "Upper-case code" };
    expect(rulingOptionsOf({ type: "single-select", titles: ["A", "B"], descriptions }).descriptions).toEqual({
      "0": "First option",
      "1": "2",
      "0xFF": "false",
      [TOO_SOON_UPPER]: "Upper-case code",
    });
  });

  it("a description that is null or undefined is not a description, and keeps the other positions", () => {
    expect(rulingOptionsOf({ type: "single-select", descriptions: { [TOO_SOON]: null, "0": "Kept" } }).descriptions).toEqual({ "0": "Kept" });
    expect(rulingOptionsOf({ type: "single-select", titles: ["A", "B", "C"], descriptions: [null, "Second", undefined] }).descriptions).toEqual({ "1": "Second" });
    // A script's structured-clone result can hold an array with holes, which JSON cannot.
    const sparse: unknown[] = [];
    sparse[1] = "Second";
    expect(rulingOptionsOf({ type: "single-select", titles: ["A", "B"], descriptions: sparse }).descriptions).toEqual({ "1": "Second" });
  });

  it("a hostile description never throws", () => {
    const hostile = { toString: 1, valueOf: 2 };
    expect(rulingOptionsOf({ type: "single-select", descriptions: { [TOO_SOON]: hostile } }).descriptions).toEqual({ [TOO_SOON]: "[object Object]" });
  });

  it("a hostile toString or valueOf never throws", () => {
    const hostile = { toString: 1, valueOf: 2 };
    expect(rulingOptionsOf({ type: "uint", titles: [hostile, [hostile]], reserved: { "0x1": hostile }, precision: hostile })).toEqual({
      type: "uint",
      titles: ["[object Object]", "[object Array]"],
      reserved: { "0x1": "[object Object]" },
    });
  });

  it("extra keys are dropped", () => {
    expect(rulingOptionsOf({ type: "single-select", titles: ["a"], onClick: "x" })).toEqual({ type: "single-select", titles: ["a"] });
  });
});

describe("reserved answers on codes the question itself uses", () => {
  function reservedOf(rulingOptions: unknown, rest: Record<string, unknown> = {}): Record<string, string> | undefined {
    return parsed({ title: "Title", rulingOptions, ...rest }).rulingOptions?.reserved;
  }

  it("a single-select keeps only the reserved answers outside code 0 and its titles' codes 1..n, so the titles win", () => {
    const reserved = { "0x0": "Nope", "0x1": "No", "0x2": "Also no", "0x3": "Kept", [TOO_SOON]: "Answered Too Soon" };
    expect(reservedOf({ type: "single-select", titles: ["Yes", "No"], reserved })).toEqual({ "0x3": "Kept", [TOO_SOON]: "Answered Too Soon" });
  });

  it("the reserved codes are compared as numbers, however the key is written", () => {
    expect(reservedOf({ type: "single-select", titles: ["Yes", "No"], reserved: { "0x01": "a", "0X02": "b", "0x0000": "c", "0x03": "Kept" } })).toEqual({ "0x03": "Kept" });
  });

  it("a multiple-select's combination codes 1..2^n belong to its titles", () => {
    const reserved = { "0x1": "None?", "0x3": "B", "0x4": "A and B", "0x5": "Kept" };
    expect(reservedOf({ type: "multiple-select", titles: ["A", "B"], reserved })).toEqual({ "0x5": "Kept" });
  });

  it("a multiple-select with more than four titles still claims every combination code without enumerating them", () => {
    const titles = Array.from({ length: 34 }, (_, index) => `Option ${String(index + 1)}`);
    const everyOption = `0x${(1n << 34n).toString(16)}`;
    const above = `0x${((1n << 34n) + 1n).toString(16)}`;
    expect(reservedOf({ type: "multiple-select", titles, reserved: { [everyOption]: "All", [above]: "Kept" } })).toEqual({ [above]: "Kept" });
  });

  it("without titles the fallback outcomes code 1..n, and without those Yes and No code 1 and 2", () => {
    expect(reservedOf({ type: "single-select", reserved: { "0x2": "x", "0x3": "y", "0x4": "Kept" } }, { outcomes: ["No", "Yes", "Maybe"] })).toEqual({ "0x4": "Kept" });
    expect(reservedOf({ type: "single-select", reserved: { "0x2": "x", "0x3": "Kept" } })).toEqual({ "0x3": "Kept" });
    expect(reservedOf({ type: "bool", reserved: { "0x2": "x", "0x3": "Kept" } })).toEqual({ "0x3": "Kept" });
  });

  it("a type the app does not know takes the fallback outcomes or Yes and No, never its own titles", () => {
    expect(reservedOf({ type: "bool", titles: ["No", "Yes", "Maybe"], reserved: { "0x2": "x", "0x3": "Kept" } })).toEqual({ "0x3": "Kept" });
  });

  it("a select with an empty title list claims no option code, a multiple-select with one only the empty combination", () => {
    expect(reservedOf({ type: "single-select", titles: [], reserved: { "0x1": "Kept" } })).toEqual({ "0x1": "Kept" });
    expect(reservedOf({ type: "multiple-select", titles: [], reserved: { "0x1": "x", "0x2": "Kept" } })).toEqual({ "0x2": "Kept" });
  });

  it("a uint, int, string, datetime or hash question keeps every reserved answer but code 0", () => {
    for (const type of ["uint", "int", "string", "datetime", "hash"]) {
      expect(reservedOf({ type, reserved: { "0x0": "x", "0x1": "Kept", [TOO_SOON]: "Answered Too Soon" } })).toEqual({ "0x1": "Kept", [TOO_SOON]: "Answered Too Soon" });
    }
  });

  it("reserved is absent when no reserved answer remains", () => {
    expect(parsed({ title: "Title", rulingOptions: { type: "single-select", titles: ["Yes"], reserved: { "0x1": "No" } } }).rulingOptions).toEqual({
      type: "single-select",
      titles: ["Yes"],
    });
  });

  it("a key that is not hex is dropped, since it codes no answer that could be listed or funded", () => {
    expect(reservedOf({ type: "single-select", titles: ["Yes"], reserved: { soon: "Odd key", "0": "Yes", "1": "No", "0x5": "Kept" } })).toEqual({ "0x5": "Kept" });
    expect(reservedOf({ type: "single-select", titles: ["Yes"], reserved: { soon: "Odd key" } })).toBeUndefined();
  });

  it("one code written in several spellings with one title keeps its first spelling, so its description still resolves", () => {
    const rulingOptions = { type: "single-select", titles: ["Yes"], reserved: { "0x05": "Soon", "0x5": "Soon", "0X005": "Soon" }, descriptions: { "0x05": "Described" } };
    const options = parsed({ title: "Title", rulingOptions }).rulingOptions;
    expect(options?.reserved).toEqual({ "0x05": "Soon" });
    expect(options?.descriptions).toEqual({ "0x05": "Described" });
  });

  it("one code written in several spellings with different titles is dropped altogether, whatever the order", () => {
    expect(reservedOf({ type: "single-select", titles: ["Yes"], reserved: { "0x5": "Pay Alice", "0x05": "Pay Bob", "0X005": "Refund", "0x6": "Kept" } })).toEqual({
      "0x6": "Kept",
    });
    expect(reservedOf({ type: "single-select", titles: ["Yes"], reserved: { "0x05": "Pay Bob", "0x5": "Pay Alice" } })).toBeUndefined();
  });
});

describe("parseMetaEvidence", () => {
  it("a merged value that is not a plain object fails the schema", () => {
    for (const value of [null, undefined, "title", 5, [], [{ title: "x" }]]) {
      const outcome = parseMetaEvidence(value);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("invalid-data");
    }
  });

  it("a title without rulingOptions gets the empty single-select", () => {
    expect(parsed({ title: "Who wins?" }).rulingOptions).toEqual({ type: "single-select", titles: [] });
  });

  it("rulingOptions without a title is valid; the title is empty", () => {
    const metaEvidence = parsed({ rulingOptions: { type: "single-select", titles: ["A", "B"] } });
    expect(metaEvidence.title).toBe("");
    expect(metaEvidence.rulingOptions).toEqual({ type: "single-select", titles: ["A", "B"] });
  });

  it("an object with neither title nor rulingOptions stays ok and renders what it has", () => {
    const metaEvidence = parsed({ description: "Only a description", question: "Q?", fileURI: "/ipfs/QmRMfJm6rLVrNYMqcdZtn2Krfuqszq2gqc7GmSV31ZbkG4" });
    expect(metaEvidence).toMatchObject({ title: "", description: "Only a description", question: "Q?", rulingOptions: null });
    expect(metaEvidence.fileURI).toBe("/ipfs/QmRMfJm6rLVrNYMqcdZtn2Krfuqszq2gqc7GmSV31ZbkG4");
  });

  it("validity is a truthiness test on the raw title and rulingOptions", () => {
    expect(parsed({ title: "", rulingOptions: 0 }).rulingOptions).toBeNull();
    expect(parsed({ title: { a: 1 } }).rulingOptions).toEqual({ type: "single-select", titles: [] });
    expect(parsed({ rulingOptions: "garbage" }).rulingOptions).toEqual({ type: "single-select", titles: [] });
  });

  it("an object title is dropped instead of crashing the page", () => {
    const metaEvidence = parsed({ title: { $$typeof: "react.element" }, description: ["a"], question: { outcomes: ["Yes"] } });
    expect(metaEvidence).toMatchObject({ title: "", description: "", question: null });
  });

  it("number and boolean title, description and question are coerced with String()", () => {
    expect(parsed({ title: 42, description: true, question: 0 })).toMatchObject({ title: "42", description: "true", question: "0" });
  });

  it("strings stay strings and hostile shapes are dropped per field", () => {
    const metaEvidence = parsed({
      title: "Title",
      category: { name: "x" },
      fileURI: { href: "javascript:alert(1)" },
      evidenceDisplayInterfaceURI: 42,
      arbitrableInterfaceURI: ["https://example.org"],
      dynamicScriptURI: null,
    });
    expect(metaEvidence).toMatchObject({ title: "Title", category: null, fileURI: null, evidenceDisplayInterfaceURI: null, arbitrableInterfaceURI: null, dynamicScriptURI: null });
  });

  it("string URIs and the category are kept as written, for the uri module to judge", () => {
    const metaEvidence = parsed({
      title: "Title",
      category: "Non-Standard Contract",
      fileURI: "http://example.org/file.pdf",
      evidenceDisplayInterfaceURI: "https://ipfs.kleros.io/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html",
      arbitrableInterfaceURI: "https://resolve.kleros.io",
      dynamicScriptURI: "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj",
    });
    expect(metaEvidence).toMatchObject({
      category: "Non-Standard Contract",
      fileURI: "http://example.org/file.pdf",
      evidenceDisplayInterfaceURI: "https://ipfs.kleros.io/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html",
      arbitrableInterfaceURI: "https://resolve.kleros.io",
      dynamicScriptURI: "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj",
    });
  });

  it("aliases keep entries whose key is an address and whose value is a string, keys as written", () => {
    const metaEvidence = parsed({ title: "T", aliases: { [CHECKSUMMED]: "Alice", [ADDRESS.replace("0x7", "0x8")]: 7, "not-an-address": "Bob", "0x1234": "Carol" } });
    expect(metaEvidence.aliases).toEqual({ [CHECKSUMMED]: "Alice" });
    expect(parsed({ title: "T", aliases: ["Alice"] }).aliases).toEqual({});
    expect(parsed({ title: "T" }).aliases).toEqual({});
  });

  it("chain IDs become a validated field; falsy values are absent", () => {
    const field = (value: unknown) => parsed({ title: "T", arbitrableChainID: value }).arbitrableChainID;
    expect(field(undefined)).toEqual({ status: "absent" });
    for (const falsy of [0, "", null, false]) expect(field(falsy)).toEqual({ status: "absent" });
    expect(field(100)).toEqual({ status: "valid", chainId: 100 });
    expect(field("100")).toEqual({ status: "valid", chainId: 100 });
    for (const bad of ["1</script><script>alert(1)</script>", "1.0", "01", " 1", 1.5, 10, "10", {}, true]) expect(field(bad)).toEqual({ status: "invalid" });
    expect(parsed({ title: "T", arbitratorChainID: "1" }).arbitratorChainID).toEqual({ status: "valid", chainId: 1 });
  });

  it("`_v` absent is null, a string is kept, and any other present value selects URLSearchParams", () => {
    expect(parsed({ title: "T" }).displayParamsVersion).toBeNull();
    expect(parsed({ title: "T", _v: "0" }).displayParamsVersion).toBe("0");
    expect(parsed({ title: "T", _v: "1" }).displayParamsVersion).toBe("1");
    for (const value of [0, null, true, {}]) expect(parsed({ title: "T", _v: value }).displayParamsVersion).toBe("");
  });

  it("fallback outcomes come from the first non-empty legacy path, coerced to strings in place", () => {
    expect(parsed({ title: "T" }).fallbackOutcomes).toBeNull();
    expect(parsed({ title: "T", outcomes: ["A", "B"], question: { outcomes: ["C"] } }).fallbackOutcomes).toEqual(["A", "B"]);
    expect(parsed({ title: "T", dispute: { template: { outcomes: [] } }, template: { outcomes: ["X", 2] }, outcomes: ["A"] }).fallbackOutcomes).toEqual(["X", "2"]);
    expect(parsed({ title: "T", dispute: { template: { outcomes: ["D"] } }, outcomes: ["A"] }).fallbackOutcomes).toEqual(["D"]);
    expect(parsed({ title: "T", outcomes: "A,B", question: { outcomes: ["Q1", { a: 1 }] } }).fallbackOutcomes).toEqual(["Q1", "[object Object]"]);
  });

  it("realityQuestion is derived, never read from the JSON", () => {
    expect(parsed({ title: "T", realityQuestion: { status: "verified" } }).realityQuestion).toBeNull();
  });

  it("a hostile toString in any field never throws", () => {
    const hostile = { toString: 1, valueOf: 2 };
    expect(() => parseMetaEvidence({ title: hostile, description: hostile, question: hostile, outcomes: [hostile], rulingOptions: { titles: [hostile] } })).not.toThrow();
  });
});

describe("INVALID_META_EVIDENCE", () => {
  it("is the invalid-or-tampered placeholder with empty single-select options", () => {
    expect(INVALID_META_EVIDENCE.title).toBe("Invalid or tampered case data, refuse to arbitrate.");
    expect(INVALID_META_EVIDENCE.description).toBe(
      "In case you have an AdBlock enabled, please disable it and refresh the page. It may be preventing the correct working of the page. If that's not the case, the data for this case is not formatted correctly or has been tampered since the time of its submission. Please refresh the page and refuse to arbitrate if the problem persists.",
    );
    expect(INVALID_META_EVIDENCE.rulingOptions).toEqual({ type: "single-select", titles: [] });
    expect(INVALID_META_EVIDENCE).toMatchObject({ question: null, fileURI: null, evidenceDisplayInterfaceURI: null, dynamicScriptURI: null, aliases: {}, realityQuestion: null });
  });

  it("cannot be mutated by a consumer", () => {
    expect(Object.isFrozen(INVALID_META_EVIDENCE)).toBe(true);
    expect(Object.isFrozen(INVALID_META_EVIDENCE.rulingOptions)).toBe(true);
  });
});
