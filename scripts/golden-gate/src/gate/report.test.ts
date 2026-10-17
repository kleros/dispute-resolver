import { describe, expect, it } from "vitest";
import type { CidPath } from "../../../../packages/core/src/uri/types";
import type { ChainEnumeration, ReferencesFile } from "../enumerate/enumerate";
import type { SideOutcome, Verdict } from "./compare";
import { OVERRIDE_1621 } from "./plan";
import { buildGateLog, renderGateLog, type GateOptions, type RunRecord } from "./report";

const DEFAULT_SCRIPT: CidPath = "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";
const GOVERNOR_SCRIPT = "QmX9qwsueTCvL7CRVi35BTTh3knDGCg9TFDqn25vth4Tf1";

const OPTIONS: GateOptions = {
  chains: [1],
  disputes: [{ chainId: 1, disputeId: 1454 }],
  cids: null,
  maxPerCid: null,
  concurrency: 4,
  oldTimeoutMs: 180_000,
  newTimeoutMs: 120_000,
  reuseEnumeration: false,
  skipBuild: true,
};

function chain(overrides: Partial<ChainEnumeration>): ChainEnumeration {
  return { chainId: 1, source: "meta-evidence-api", scope: "listed", blockNumber: 26_192_791, disputeCount: 2, statusCounts: { runs: 1 }, notes: [], ...overrides };
}

function references(chains: readonly ChainEnumeration[]): ReferencesFile {
  return {
    generatedAt: "2026-10-15T00:00:00.000Z",
    chains,
    references: [],
    testnetRealityCheck: { listed: 0, missing: [] },
    allowlist: { "1": [DEFAULT_SCRIPT, GOVERNOR_SCRIPT] },
  };
}

const SUCCESS: SideOutcome = { kind: "success", value: { arbitrableInterfaceURI: "https://resolve.kleros.io/cases/1454" }, jsonDuplicateKeys: false };

const HARNESS_FAILURE: SideOutcome = { kind: "harness-failure", detail: "the harness failed: Target page, context or browser has been closed" };

function run(verdict: Verdict, outcome: SideOutcome = SUCCESS): RunRecord {
  const side = { scriptCid: DEFAULT_SCRIPT, params: {}, frame: null, outcome, durationMs: 1, diagnostics: null };
  return {
    id: "1:1454",
    purpose: "production-vs-new-app",
    chainId: 1,
    disputeId: 1454,
    arbitrable: "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf",
    cid: DEFAULT_SCRIPT,
    scriptKind: "standard",
    charsetSensitive: false,
    production: { ...side, frame: "opaque" },
    newApp: side,
    verdict,
    earlierVerdicts: [],
  };
}

describe("gate log (04 §5, C6)", () => {
  it("C6: a run restricted to listed disputes reports unexercised scripts as not referenced by a listed dispute", () => {
    const log = buildGateLog({ references: references([chain({})]), runs: [run("identical")], options: OPTIONS, partial: true, chromium: "1" });
    expect(log.unexercised).toEqual([
      { chainId: 1, cid: GOVERNOR_SCRIPT, runs: 0, verdicts: {}, unexercisedReason: "no listed dispute references it" },
      { chainId: 1, cid: OVERRIDE_1621.cid, runs: 0, verdicts: {}, unexercisedReason: "no listed dispute references it" },
    ]);
    expect(log.enumeration.chains[0]).toMatchObject({ scope: "listed", disputeCount: 2 });
    expect(renderGateLog(log)).toContain("| 1 | meta-evidence-api | 26192791 | 2 (listed only) | 1 |");
  });

  it("C6: lists the disputes whose meta-evidence the gateway did not serve, which could hide a reference", () => {
    const notes = [{ disputeId: 7, status: "meta-evidence-fetch-failed" as const, detail: "the gateway answered HTTP 504", cid: null }];
    const log = buildGateLog({ references: references([chain({ scope: "all", notes })]), runs: [run("identical")], options: OPTIONS, partial: false, chromium: "1" });
    expect(log.enumeration.metaEvidenceUnfetched).toEqual([{ chainId: 1, disputeId: 7, detail: "the gateway answered HTTP 504" }]);
    expect(renderGateLog(log)).toContain("Disputes whose meta-evidence the gateway did not serve (a script they name is not known): 1:7.");
    expect(log.passed).toBe(true);
  });

  it("C6: a failing verdict or a dispute left unread fails the gate", () => {
    const unread = [{ disputeId: 3, status: "read-error" as const, detail: "the request failed", cid: null }];
    expect(buildGateLog({ references: references([chain({})]), runs: [run("different-output")], options: OPTIONS, partial: true, chromium: "1" }).passed).toBe(false);
    expect(buildGateLog({ references: references([chain({ notes: unread })]), runs: [run("identical")], options: OPTIONS, partial: true, chromium: "1" }).passed).toBe(false);
  });

  it("C6: a run the harness could not execute fails the gate and does not exercise its script", () => {
    const log = buildGateLog({ references: references([chain({})]), runs: [run("harness-failure", HARNESS_FAILURE)], options: OPTIONS, partial: true, chromium: "1" });
    expect(log.passed).toBe(false);
    expect(log.summary).toMatchObject({ runs: 1, passed: 0, forReview: 0, failed: 1 });
    expect(log.unexercised).toContainEqual({
      chainId: 1,
      cid: DEFAULT_SCRIPT,
      runs: 0,
      verdicts: { "harness-failure": 1 },
      unexercisedReason: "its 1 run failed in the harness, so neither runner executed it",
    });
    expect(renderGateLog(log)).toContain("harness-failure (the harness failed: Target page, context or browser has been closed)");
  });
});
