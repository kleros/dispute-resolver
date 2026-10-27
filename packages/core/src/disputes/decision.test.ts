import { describe, expect, it } from "vitest";
import type { RulingOptions } from "../rulings/types";
import { deriveCompatibility, deriveDecision } from ".";
import type { Compatibility, LocalIdResolution } from "./types";
import { recordedDetection } from "../test/disputes/testHelpers";

const YES_NO: RulingOptions = { type: "single-select", titles: ["Yes", "No"] };
const RESOLVED: LocalIdResolution = { kind: "local-id", value: 0n };

describe("deriveDecision", () => {
  it.each([0, 1, 2] as const)("has no decision alert in period %i", (period) => {
    expect(deriveDecision({ period, currentRuling: 1n, fundedRulings: [2n], rulingOptions: YES_NO, fallbackOutcomes: null, compatibility: "full" })).toEqual({ kind: "none" });
  });

  it("in the appeal period the jury decision is the current ruling, appealable", () => {
    expect(deriveDecision({ period: 3, currentRuling: 2n, fundedRulings: [1n], rulingOptions: YES_NO, fallbackOutcomes: null, compatibility: "full" })).toEqual({
      kind: "jury-decision",
      ruling: 2n,
      rulingText: "No",
      appealHint: false,
    });
  });

  it("a view-only dispute's jury decision carries the hint to appeal in the arbitrable application", () => {
    const decision = deriveDecision({ period: 3, currentRuling: 1n, fundedRulings: [], rulingOptions: YES_NO, fallbackOutcomes: null, compatibility: "view-only" });
    expect(decision).toMatchObject({ kind: "jury-decision", appealHint: true });
  });

  it("in execution, exactly one funded ruling wins by default even against the current ruling", () => {
    expect(deriveDecision({ period: 4, currentRuling: 1n, fundedRulings: [2n], rulingOptions: YES_NO, fallbackOutcomes: null, compatibility: "full" })).toEqual({
      kind: "winner",
      ruling: 2n,
      rulingText: "No",
      wonBy: "default",
    });
  });

  it.each([
    ["no funded ruling", []],
    ["two funded rulings", [1n, 2n]],
  ])("in execution with %s, the current ruling wins by jury decision", (_, fundedRulings) => {
    expect(deriveDecision({ period: 4, currentRuling: 1n, fundedRulings, rulingOptions: YES_NO, fallbackOutcomes: null, compatibility: "full" })).toEqual({
      kind: "winner",
      ruling: 1n,
      rulingText: "Yes",
      wonBy: "jury",
    });
  });

  it("without ruling options the fallback outcomes are used, else the decimal value", () => {
    expect(deriveDecision({ period: 3, currentRuling: 2n, fundedRulings: [], rulingOptions: null, fallbackOutcomes: ["Red", "Blue"], compatibility: "full" })).toMatchObject({
      rulingText: "Blue",
    });
    expect(deriveDecision({ period: 3, currentRuling: 7n, fundedRulings: [], rulingOptions: null, fallbackOutcomes: null, compatibility: "full" })).toMatchObject({
      rulingText: "7",
    });
  });
});

describe("deriveCompatibility", () => {
  const IDR_V2 = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
  const GNOSIS_MODERATE = "0xe04f5791d671d5c4e08ab49b39807087b591ea3e";
  const REVERTED: LocalIdResolution = { kind: "unresolved", reason: "reverted" };

  it("an unknown family is view-only", () => {
    expect(deriveCompatibility(undefined, RESOLVED)).toBe("view-only");
  });

  it.each<[string, number, string, LocalIdResolution, Compatibility]>([
    ["an idr-v2 arbitrable with its local ID resolved is full (mainnet 1454)", 1, IDR_V2, RESOLVED, "full"],
    ["an arbitrable whose local-ID read reverted is view-only", 1, IDR_V2, REVERTED, "view-only"],
    ["an arbitrable whose local-ID read failed on the RPC is view-only", 1, IDR_V2, { kind: "unresolved", reason: "rpc-error" }, "view-only"],
    ["the idr-legacy proxy is full (mainnet 505, 328)", 1, "0x135c573503f70dc290b1d60fe2e7f7eb114febd6", { kind: "local-id", value: 51n }, "full"],
    ["an Escrow V1 arbitrable with its transaction ID is full (mainnet 878)", 1, "0xc25a0b9681abf6f090aed71a8c08fb564b41dab6", { kind: "transaction-id", value: 16n }, "full"],
    [
      "a governor with submitEvidence(string) is full without a local ID (poh.eth, mainnet 1621)",
      1,
      "0x327a29fce0a6490e4236240be176daa282eccfdf",
      { kind: "not-applicable" },
      "full",
    ],
    ["the kleros.eth governor is view-only for evidence (mainnet 1672, 535)", 1, "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4", { kind: "not-applicable" }, "view-only"],
    ["Proof of Humanity v2 is view-only (mainnet 1674)", 1, "0xbe9834097a4e97689d9b667441acafb456d0480a", { kind: "not-applicable" }, "view-only"],
    ["a registered Reality proxy with its local ID resolved is full (Gnosis Moderate)", 100, GNOSIS_MODERATE, RESOLVED, "full"],
    ["a registered Reality proxy whose local-ID read reverted is view-only (Gnosis Moderate)", 100, GNOSIS_MODERATE, REVERTED, "view-only"],
  ])("%s", async (_, chainId, address, localId, expected) => {
    expect(deriveCompatibility(await recordedDetection(chainId, address), localId)).toBe(expected);
  });

  it("the Gnosis Moderate Reality proxy detects as reality-proxy with the idr-v2 write family", async () => {
    expect(await recordedDetection(100, GNOSIS_MODERATE)).toMatchObject({ family: "reality-proxy", writeFamily: "idr-v2" });
  });
});
