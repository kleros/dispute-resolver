import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normalizeIpfsPath, toCidPath } from "../uri";
import fixtureJson from "./__fixtures__/today-allowlists.json";
import { REGISTRY } from "./registry";
import { DISPUTE_1621_OVERRIDE, sortedStrings } from "./testHelpers";

/**
 * `today-allowlists.json` is generated from the old app by `__fixtures__/generate-today-allowlists.mjs`; nothing in it
 * is typed by hand. The registry data must equal it, apart from the changes the deviations ledger records.
 */
const listsSchema = z.record(z.string(), z.array(z.string()));
const fixtureSchema = z.object({
  note: z.string(),
  sourceCommit: z.string(),
  realityProxies: z.record(z.string(), z.object({ proxy: z.string() }).loose()),
  dynamicScriptWhitelist: listsSchema,
  arbitrableWhitelist: listsSchema,
});
const today = fixtureSchema.parse(fixtureJson);

/** Each chain's members sorted, keyed by chain, so lists compare as sets whatever their declaration order. */
function asSets(record: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(record).map(([chain, values]) => [chain, sortedStrings(values)]));
}

describe("the comparison fixture", () => {
  it("A1: the fixture names the commit of the old app it was generated from", () => {
    expect(today.note).toContain(today.sourceCommit);
    expect(today.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("06 §3 invariant 5: displayAllowlist equals today's arbitrableWhitelist", () => {
  it("B6: the same chain keys", () => {
    expect(sortedStrings(Object.keys(REGISTRY.displayAllowlist))).toEqual(sortedStrings(Object.keys(today.arbitrableWhitelist)));
  });

  it("B6: the same members per chain after lowercase normalization (Reality addresses included)", () => {
    const todayNormalized = asSets(Object.fromEntries(Object.entries(today.arbitrableWhitelist).map(([chain, values]) => [chain, values.map((value) => value.toLowerCase())])));
    expect(asSets(REGISTRY.displayAllowlist)).toEqual(todayNormalized);
  });
});

describe("A1: the dynamic-script allowlist equals today's after path normalization, minus the dispute 1621 override", () => {
  it("A1: the same chains", () => {
    expect(sortedStrings(Object.keys(REGISTRY.dynamicScriptAllowlist))).toEqual(sortedStrings(Object.keys(today.dynamicScriptWhitelist)));
  });

  it("A1: the same entries per chain", () => {
    const expected = Object.fromEntries(
      Object.entries(today.dynamicScriptWhitelist).map(([chain, uris]) => [
        chain,
        uris
          .filter((uri) => uri !== DISPUTE_1621_OVERRIDE)
          .map((uri) => {
            const canonical = normalizeIpfsPath(uri);
            if (canonical === null) throw new Error(`today's entry ${uri} does not normalize`);
            return toCidPath(canonical);
          }),
      ]),
    );
    expect(asSets(REGISTRY.dynamicScriptAllowlist)).toEqual(asSets(expected));
  });

  it("D-25: the override CID is the only entry of today's lists that the registry drops", () => {
    const listsWithOverride = Object.values(today.dynamicScriptWhitelist).filter((uris) => uris.includes(DISPUTE_1621_OVERRIDE));
    expect(listsWithOverride).toHaveLength(1);
    const todayCount = Object.values(today.dynamicScriptWhitelist).reduce((sum, uris) => sum + uris.length, 0);
    const registryCount = Object.values(REGISTRY.dynamicScriptAllowlist).reduce((sum, entries) => sum + entries.length, 0);
    expect(registryCount).toBe(todayCount - 1);
  });
});

describe("06 §2: realityProxies keeps today's REALITY_PROXIES, fields unchanged, plus a justification", () => {
  it("06 §2: the same keys", () => {
    expect(sortedStrings(Object.keys(REGISTRY.realityProxies))).toEqual(sortedStrings(Object.keys(today.realityProxies)));
  });

  it("06 §2: every field of every entry is unchanged", () => {
    const registryEntries = new Map(Object.entries(REGISTRY.realityProxies));
    for (const [key, old] of Object.entries(today.realityProxies)) {
      const entry = registryEntries.get(key);
      expect(entry, key).toBeDefined();
      if (entry === undefined) continue;
      const { justification, ...fields } = entry;
      expect(justification.length, key).toBeGreaterThan(0);
      expect(fields, key).toEqual(old);
    }
  });
});
