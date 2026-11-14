import { describe, expect, it } from "vitest";
import { safePopulatedJSONForTemplate } from "./safeQuestion";

const D = "␟";

describe("hostile templates", () => {
  it("analyzes a template stuffed with every nonce candidate in linear time", () => {
    const candidates = Array.from({ length: 40_000 }, (_unused, index) => `@@kleros${String(index)}#`);
    const hostile = `{"title": "${candidates.join(" ")}%s", "type": "bool", "category": "%s", "lang": "%s"}`;
    expect(hostile.length).toBeGreaterThan(400_000);

    const started = performance.now();
    const result = safePopulatedJSONForTemplate(hostile, `a${D}b${D}c`);
    const elapsedMs = performance.now() - started;

    expect(result).toMatchObject({ ok: true, question: { type: "bool", category: "b", lang: "c" } });
    expect(elapsedMs).toBeLessThan(500);
  });
});
