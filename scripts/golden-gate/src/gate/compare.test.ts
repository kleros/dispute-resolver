import { describe, expect, it } from "vitest";
import { canonicalJson, classifyNew, classifyOld, compareOutcomes, type OldRunContext, type SideOutcome } from "./compare";

const OPTIONS = { rulingOptions: { type: "single-select", titles: ["Harris", "Trump"], reserved: { "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe": "Answered Too Soon" } } };
const GARBLED = { rulingOptions: { titles: [new TextDecoder("windows-1252").decode(new TextEncoder().encode("Sí"))] } };

/** A Reality renderer with the reality-eth-lib delimiter as a raw literal, run in production's opaque frame. */
const OPAQUE_REALITY: OldRunContext = { frame: "opaque", charsetSensitive: true, scriptKind: "reality" };
const ANY_RUN: OldRunContext = { frame: "same-origin", charsetSensitive: false, scriptKind: "standard" };
const BOOL_OPTIONS = { type: "single-select", titles: ["No", "Yes"], reserved: { "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF": "Answered Too Soon" } };

function success(value: unknown, jsonDuplicateKeys = false): SideOutcome {
  return { kind: "success", value, jsonDuplicateKeys };
}

describe("C6 comparison rule (04 §5)", () => {
  it("C6: where production succeeds, identical outputs pass whatever their key order", () => {
    const reordered = { rulingOptions: { reserved: OPTIONS.rulingOptions.reserved, titles: ["Harris", "Trump"], type: "single-select" } };
    expect(compareOutcomes(success(OPTIONS), success(reordered))).toBe("identical");
  });

  it("C6: where production succeeds, a different output fails", () => {
    expect(compareOutcomes(success(OPTIONS), success({ rulingOptions: { titles: ["Trump", "Harris"] } }))).toBe("different-output");
    expect(compareOutcomes(success(OPTIONS, false), success(OPTIONS, true))).toBe("different-output");
  });

  it("C6: where production succeeds, a new-runner failure fails", () => {
    expect(compareOutcomes(success(OPTIONS), classifyNew({ status: "failed", reason: "timeout", message: "timed out" }))).toBe("new-runner-failed");
  });

  it("C6: an empty {} production result counts as a production failure, so a new-runner success is reviewed by hand", () => {
    const production = classifyOld({ status: "result", result: {}, jsonDuplicateKeys: false }, 180_000, ANY_RUN);
    expect(production).toMatchObject({ kind: "failure", failureClass: "empty-result" });
    expect(compareOutcomes(production, classifyNew({ status: "ok", value: OPTIONS, jsonDuplicateKeys: false }))).toBe("improvement-for-review");
  });

  it("C6: charset-garbled production output counts as a production failure", () => {
    const production = classifyOld({ status: "result", result: GARBLED, jsonDuplicateKeys: false }, 180_000, ANY_RUN);
    expect(production).toMatchObject({ kind: "failure", failureClass: "garbled-result" });
    expect(compareOutcomes(production, classifyNew({ status: "ok", value: { rulingOptions: { titles: ["Sí"] } }, jsonDuplicateKeys: false }))).toBe("improvement-for-review");
  });

  it("C6: an opaque-frame Reality result whose question keeps the ␟ delimiter is a production charset failure (D-29)", () => {
    const production = classifyOld({ status: "result", result: { question: "test5555␟misc␟", rulingOptions: BOOL_OPTIONS }, jsonDuplicateKeys: false }, 180_000, OPAQUE_REALITY);
    expect(production).toMatchObject({ kind: "failure", failureClass: "garbled-result" });
    const next = classifyNew({ status: "ok", value: { question: "test5555", rulingOptions: BOOL_OPTIONS }, jsonDuplicateKeys: false });
    expect(compareOutcomes(production, next)).toBe("improvement-for-review");
  });

  it("C6: a ␟ in the output stays a production success outside an opaque frame running a charset-sensitive Reality renderer (D-29)", () => {
    const output = { status: "result", result: { question: "test5555␟misc␟", rulingOptions: BOOL_OPTIONS }, jsonDuplicateKeys: false } as const;
    expect(classifyOld(output, 180_000, { ...OPAQUE_REALITY, frame: "same-origin" })).toMatchObject({ kind: "success" });
    expect(classifyOld(output, 180_000, { ...OPAQUE_REALITY, charsetSensitive: false })).toMatchObject({ kind: "success" });
    expect(classifyOld(output, 180_000, { ...OPAQUE_REALITY, scriptKind: "standard" })).toMatchObject({ kind: "success" });
  });

  it("C6: an opaque-frame Reality result split on its delimiter stays a production success (D-29)", () => {
    const output = { status: "result", result: { question: "test2?", rulingOptions: BOOL_OPTIONS }, jsonDuplicateKeys: false } as const;
    expect(classifyOld(output, 180_000, OPAQUE_REALITY)).toMatchObject({ kind: "success" });
  });

  it("C6: where both fail, the failure class must match", () => {
    const timeout = classifyOld({ status: "timeout" }, 180_000, ANY_RUN);
    expect(compareOutcomes(timeout, classifyNew({ status: "failed", reason: "script-error", message: "The dynamic script failed: boom" }))).toBe("same-failure-class");
    expect(compareOutcomes(timeout, classifyNew({ status: "ok", value: {}, jsonDuplicateKeys: false }))).toBe("different-failure-class");
    expect(compareOutcomes(timeout, classifyNew({ status: "failed", reason: "runner-error", message: "malformed reply" }))).toBe("different-failure-class");
  });

  it("C6: a side the harness could not run fails the comparison whatever the other side's outcome", () => {
    const harness: SideOutcome = { kind: "harness-failure", detail: "the harness failed: Target page, context or browser has been closed" };
    expect(compareOutcomes(harness, harness)).toBe("harness-failure");
    expect(compareOutcomes(success(OPTIONS), harness)).toBe("harness-failure");
    expect(compareOutcomes(harness, success(OPTIONS))).toBe("harness-failure");
    expect(compareOutcomes(classifyOld({ status: "timeout" }, 180_000, ANY_RUN), harness)).toBe("harness-failure");
  });

  it("C6: canonical JSON sorts keys at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: [{ f: 1, e: 2 }], c: 3 } })).toBe('{"a":{"c":3,"d":[{"e":2,"f":1}]},"b":1}');
  });
});
