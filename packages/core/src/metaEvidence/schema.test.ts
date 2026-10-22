import { describe, expect, it } from "vitest";
import { INVALID_META_EVIDENCE, parseMetaEvidence, parseRulingOptions } from "./index";
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

describe("parseRulingOptions", () => {
  it("defaults missing or invalid ruling options", () => {
    expect(parseRulingOptions(undefined)).toEqual({ type: "single-select", titles: [] });
    expect(parseRulingOptions("x")).toEqual({ type: "single-select", titles: [] });
    expect(parseRulingOptions({ titles: ["a"] })).toEqual({ type: "single-select", titles: ["a"] });
  });

  it("coerces titles, reserved answers and precision", () => {
    expect(parseRulingOptions({ type: "single-select", titles: "a,b" }).titles).toEqual([]);
    expect(parseRulingOptions({ type: "single-select", titles: [1, { a: 1 }] }).titles).toEqual(["1", "[object Object]"]);
    expect(parseRulingOptions({ type: "single-select", reserved: [1] })).not.toHaveProperty("reserved");
    expect(parseRulingOptions({ type: "single-select", reserved: { "0x1": 2 } }).reserved).toEqual({ "0x1": "2" });
    expect(parseRulingOptions({ type: "uint", precision: "x" })).not.toHaveProperty("precision");
    expect(parseRulingOptions({ type: "uint", precision: 18 }).precision).toBe(18);
  });

  it("a hexadecimal precision is read as reality-eth-lib reads it", () => {
    expect(parseRulingOptions({ type: "uint", precision: "0x12" }).precision).toBe(18);
    expect(parseRulingOptions({ type: "uint", precision: " 0X12 " }).precision).toBe(18);
  });

  it("a non-object (null, array, number) becomes the empty single-select", () => {
    for (const value of [null, [], ["a"], 5, true]) expect(parseRulingOptions(value)).toEqual({ type: "single-select", titles: [] });
  });

  it("a non-string type becomes single-select and an unknown type string is kept verbatim", () => {
    expect(parseRulingOptions({ type: 3, titles: ["a"] }).type).toBe("single-select");
    expect(parseRulingOptions({ type: "ranked-choice" }).type).toBe("ranked-choice");
  });

  it("titles are left absent when absent, and reserved and precision are dropped only when unusable", () => {
    expect(parseRulingOptions({ type: "uint" })).toEqual({ type: "uint" });
    expect(parseRulingOptions({ type: "uint", precision: Number.POSITIVE_INFINITY })).toEqual({ type: "uint" });
    expect(parseRulingOptions({ type: "uint", reserved: null })).toEqual({ type: "uint" });
  });

  it("keeps a precision of 0 and reads a numeric string precision as its number", () => {
    expect(parseRulingOptions({ type: "uint", precision: 0 }).precision).toBe(0);
    expect(parseRulingOptions({ type: "uint", precision: "6" }).precision).toBe(6);
  });

  it("reads precision as reality-eth-lib does, so the precision shown is the one encoded", () => {
    expect(parseRulingOptions({ type: "uint", precision: true }).precision).toBe(0);
    expect(parseRulingOptions({ type: "uint", precision: "1e2" }).precision).toBe(1);
    expect(parseRulingOptions({ type: "uint", precision: 2.7 }).precision).toBe(2);
    expect(parseRulingOptions({ type: "uint", precision: -3 }).precision).toBe(0);
  });

  it("removes a precision that would encode with the default 18 (null, false, empty, or not a finite number)", () => {
    for (const precision of [null, false, "", "1_000"]) expect(parseRulingOptions({ type: "uint", precision })).toEqual({ type: "uint" });
  });

  it("descriptions become strings; a value that is neither an array nor an object is removed", () => {
    expect(parseRulingOptions({ type: "single-select", titles: ["a"], descriptions: ["first", 2] }).descriptions).toEqual(["first", "2"]);
    for (const descriptions of ["first", 3, true, null]) expect(parseRulingOptions({ type: "single-select", descriptions })).not.toHaveProperty("descriptions");
  });

  it("descriptions keyed by reserved answer code are kept", () => {
    const options = parseRulingOptions({
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
    expect(parseRulingOptions({ type: "single-select", titles: ["A", "B"], descriptions }).descriptions).toEqual({
      "0": "First option",
      "1": "2",
      "0xFF": "false",
      [TOO_SOON_UPPER]: "Upper-case code",
    });
  });

  it("a description that is null or undefined is not a description, and keeps the other positions", () => {
    expect(parseRulingOptions({ type: "single-select", descriptions: { [TOO_SOON]: null, "0": "Kept" } }).descriptions).toEqual({ "0": "Kept" });
    expect(parseRulingOptions({ type: "single-select", titles: ["A", "B", "C"], descriptions: [null, "Second", undefined] }).descriptions).toEqual({ "1": "Second" });
    // A script's structured-clone result can hold an array with holes, which JSON cannot.
    const sparse: unknown[] = [];
    sparse[1] = "Second";
    expect(parseRulingOptions({ type: "single-select", titles: ["A", "B"], descriptions: sparse }).descriptions).toEqual({ "1": "Second" });
  });

  it("a hostile description never throws", () => {
    const hostile = { toString: 1, valueOf: 2 };
    expect(parseRulingOptions({ type: "single-select", descriptions: { [TOO_SOON]: hostile } }).descriptions).toEqual({ [TOO_SOON]: "[object Object]" });
  });

  it("a hostile toString or valueOf never throws", () => {
    const hostile = { toString: 1, valueOf: 2 };
    expect(parseRulingOptions({ type: "uint", titles: [hostile, [hostile]], reserved: { "0x1": hostile }, precision: hostile })).toEqual({
      type: "uint",
      titles: ["[object Object]", "[object Array]"],
      reserved: { "0x1": "[object Object]" },
    });
  });

  it("extra keys are dropped", () => {
    expect(parseRulingOptions({ type: "single-select", titles: ["a"], onClick: "x" })).toEqual({ type: "single-select", titles: ["a"] });
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
