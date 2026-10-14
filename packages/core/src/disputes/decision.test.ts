import { describe, expect, it } from "vitest";
import type { FamilyDetection } from "../families/types";
import type { RulingOptions } from "../rulings/types";
import { deriveCompatibility, deriveDecision } from ".";
import type { LocalIdResolution } from "./types";
import { recordedDetection } from "./testHelpers";

const YES_NO: RulingOptions = { type: "single-select", titles: ["Yes", "No"] };
const RESOLVED: LocalIdResolution = { kind: "local-id", value: 0n };

describe("deriveDecision", () => {
  it.each([0, 1, 2] as const)("§5.9: no decision alert in period %i", (period) => {
    expect(deriveDecision({ period, currentRuling: 1n, fundedRulings: [2n], rulingOptions: YES_NO, fallbackOutcomes: null, compatibility: "full" })).toEqual({ kind: "none" });
  });

  it("§5.9: in the appeal period the jury decision is the current ruling, appealable", () => {
    expect(deriveDecision({ period: 3, currentRuling: 2n, fundedRulings: [1n], rulingOptions: YES_NO, fallbackOutcomes: null, compatibility: "full" })).toEqual({
      kind: "jury-decision",
      ruling: 2n,
      rulingText: "No",
      appealHint: false,
    });
  });

  it("§5.9: a view-only dispute's jury decision carries the hint to appeal in the arbitrable application", () => {
    const decision = deriveDecision({ period: 3, currentRuling: 1n, fundedRulings: [], rulingOptions: YES_NO, fallbackOutcomes: null, compatibility: "view-only" });
    expect(decision).toMatchObject({ kind: "jury-decision", appealHint: true });
  });

  it("§5.9: in execution, exactly one funded ruling wins by default even against the current ruling", () => {
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
  ])("§5.9: in execution with %s, the current ruling wins by jury decision", (_, fundedRulings) => {
    expect(deriveDecision({ period: 4, currentRuling: 1n, fundedRulings, rulingOptions: YES_NO, fallbackOutcomes: null, compatibility: "full" })).toEqual({
      kind: "winner",
      ruling: 1n,
      rulingText: "Yes",
      wonBy: "jury",
    });
  });

  it("§5.9: ruling 0 reads as refused to arbitrate", () => {
    const decision = deriveDecision({ period: 4, currentRuling: 0n, fundedRulings: [], rulingOptions: YES_NO, fallbackOutcomes: null, compatibility: "full" });
    expect(decision).toMatchObject({ ruling: 0n, rulingText: "invalid / refused to arbitrate / tied" });
  });

  it("§5.9: a hash question's ruling reads as 64 hex digits", () => {
    const decision = deriveDecision({ period: 4, currentRuling: 0xabcn, fundedRulings: [], rulingOptions: { type: "hash" }, fallbackOutcomes: null, compatibility: "full" });
    expect(decision).toMatchObject({ rulingText: `0x${"abc".padStart(64, "0")}` });
  });

  it("§5.9: a multiple-select ruling decodes its bitmask (Gnosis 0, ruling 5)", () => {
    const decision = deriveDecision({
      period: 4,
      currentRuling: 5n,
      fundedRulings: [],
      rulingOptions: { type: "multiple-select", titles: ["A", "B", "C"] },
      fallbackOutcomes: null,
      compatibility: "full",
    });
    expect(decision).toMatchObject({ ruling: 5n, rulingText: "C" });
  });

  it("§5.9: without ruling options the fallback outcomes are used, else the decimal value", () => {
    expect(deriveDecision({ period: 3, currentRuling: 2n, fundedRulings: [], rulingOptions: null, fallbackOutcomes: ["Red", "Blue"], compatibility: "full" })).toMatchObject({
      rulingText: "Blue",
    });
    expect(deriveDecision({ period: 3, currentRuling: 7n, fundedRulings: [], rulingOptions: null, fallbackOutcomes: null, compatibility: "full" })).toMatchObject({ rulingText: "7" });
  });
});

describe("deriveCompatibility", () => {
  it("§5.5: an unknown family is view-only", () => {
    expect(deriveCompatibility(undefined, RESOLVED)).toBe("view-only");
  });

  it("§5.5: an idr-v2 arbitrable with its local ID resolved is full (mainnet 1454)", async () => {
    expect(deriveCompatibility(await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf"), RESOLVED)).toBe("full");
  });

  it("§5.5, §11.1: an arbitrable that needs a local ID it could not resolve is view-only", async () => {
    const family = await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");
    expect(deriveCompatibility(family, { kind: "unresolved", reason: "reverted" })).toBe("view-only");
    expect(deriveCompatibility(family, { kind: "unresolved", reason: "rpc-error" })).toBe("view-only");
  });

  it("D-46: the idr-legacy proxy is full (mainnet 505, 328)", async () => {
    const family = await recordedDetection(1, "0x135c573503f70dc290b1d60fe2e7f7eb114febd6");
    expect(family.family).toBe("idr-legacy");
    expect(deriveCompatibility(family, { kind: "local-id", value: 51n })).toBe("full");
  });

  it("§10.2: an Escrow V1 arbitrable with its transaction ID is full (mainnet 878)", async () => {
    expect(deriveCompatibility(await recordedDetection(1, "0xc25a0b9681abf6f090aed71a8c08fb564b41dab6"), { kind: "transaction-id", value: 16n })).toBe("full");
  });

  it("§10.3: a governor with submitEvidence(string) is full without a local ID (poh.eth, mainnet 1621)", async () => {
    expect(deriveCompatibility(await recordedDetection(1, "0x327a29fce0a6490e4236240be176daa282eccfdf"), { kind: "not-applicable" })).toBe("full");
  });

  it("D-47: the kleros.eth governor is view-only for evidence (mainnet 1672, 535)", async () => {
    const family = await recordedDetection(1, "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4");
    expect(family.family).toBe("governor");
    expect(deriveCompatibility(family, { kind: "not-applicable" })).toBe("view-only");
  });

  it("§11.1: Proof of Humanity v2 is view-only (mainnet 1674)", async () => {
    expect(deriveCompatibility(await recordedDetection(1, "0xbe9834097a4e97689d9b667441acafb456d0480a"), { kind: "not-applicable" })).toBe("view-only");
  });

  it("06 §1: a registered Reality proxy follows its write family (Gnosis Moderate, write family idr-v2)", async () => {
    const family: FamilyDetection = await recordedDetection(100, "0xe04f5791d671d5c4e08ab49b39807087b591ea3e");
    expect(family).toMatchObject({ family: "reality-proxy", writeFamily: "idr-v2" });
    expect(deriveCompatibility(family, RESOLVED)).toBe("full");
    expect(deriveCompatibility(family, { kind: "unresolved", reason: "reverted" })).toBe("view-only");
  });
});
