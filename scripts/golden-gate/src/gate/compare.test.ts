import { describe, expect, it } from "vitest";
import { canonicalJson, classifyNew, classifyOld, compareOutcomes, type SideOutcome } from "./compare";

const OPTIONS = { rulingOptions: { type: "single-select", titles: ["Harris", "Trump"], reserved: { "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe": "Answered Too Soon" } } };
const GARBLED = { rulingOptions: { titles: [new TextDecoder("windows-1252").decode(new TextEncoder().encode("Sí"))] } };

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
    const production = classifyOld({ status: "result", result: {}, jsonDuplicateKeys: false }, 180_000);
    expect(production).toMatchObject({ kind: "failure", failureClass: "empty-result" });
    expect(compareOutcomes(production, classifyNew({ status: "ok", value: OPTIONS, jsonDuplicateKeys: false }))).toBe("improvement-for-review");
  });

  it("C6: charset-garbled production output counts as a production failure", () => {
    const production = classifyOld({ status: "result", result: GARBLED, jsonDuplicateKeys: false }, 180_000);
    expect(production).toMatchObject({ kind: "failure", failureClass: "garbled-result" });
    expect(compareOutcomes(production, classifyNew({ status: "ok", value: { rulingOptions: { titles: ["Sí"] } }, jsonDuplicateKeys: false }))).toBe("improvement-for-review");
  });

  it("C6: where both fail, the failure class must match", () => {
    const timeout = classifyOld({ status: "timeout" }, 180_000);
    expect(compareOutcomes(timeout, classifyNew({ status: "failed", reason: "script-error", message: "The dynamic script failed: boom" }))).toBe("same-failure-class");
    expect(compareOutcomes(timeout, classifyNew({ status: "ok", value: {}, jsonDuplicateKeys: false }))).toBe("different-failure-class");
    expect(compareOutcomes(timeout, classifyNew({ status: "failed", reason: "runner-error", message: "malformed reply" }))).toBe("different-failure-class");
  });

  it("C6: canonical JSON sorts keys at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: [{ f: 1, e: 2 }], c: 3 } })).toBe('{"a":{"c":3,"d":[{"e":2,"f":1}]},"b":1}');
  });
});
