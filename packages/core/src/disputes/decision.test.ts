import { describe, expect, it } from "vitest";
import type { AppealRoute, AppealRules } from "../families/types";
import type { MetaEvidence, MetaEvidenceResult } from "../metaEvidence/types";
import type { Outcome } from "../types";
import { buildDecision, decisionNeedsFunding, deriveCompatibility } from ".";
import type { ArbitratorDispute, Compatibility, Decision, DisputeReads, ExecutedRuling, LocalIdResolution } from "./types";
import { recordedDetection } from "../test/disputes/testHelpers";
import { testBinding } from "../test/appeals/testHelpers";

const RESOLVED: LocalIdResolution = { kind: "local-id", value: 0n };
const ARBITRABLE = "0x00000000000000000000000000000000000000dd";
const DISPUTE: ArbitratorDispute = { id: 7n, subcourtId: 0n, arbitrated: ARBITRABLE, numberOfChoices: 2n, period: 4, lastPeriodChange: 0, ruled: true };
const RULES: AppealRules = { route: "arbitrable", tie: null, noun: "option" };
const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const NOT_READ: Outcome<never> = { ok: false, error: { code: "rpc-error", message: "Could not read: down" } };

function reads(currentRuling: Outcome<bigint>): DisputeReads {
  return {
    dispute: DISPUTE,
    binding: testBinding({ disputeId: DISPUTE.id, arbitrated: ARBITRABLE }),
    votesLengths: ok([3n]),
    currentRuling,
    appealDecisions: ok([]),
    appealInfo: null,
    localId: { kind: "not-applicable" },
  };
}

function metaEvidence(rulingOptions: MetaEvidence["rulingOptions"], status: "ok" | "invalid" = "ok"): MetaEvidenceResult {
  const value: MetaEvidence = {
    title: "Question",
    description: "",
    question: "Question?",
    category: null,
    rulingOptions,
    fallbackOutcomes: null,
    fileURI: null,
    evidenceDisplayInterfaceURI: null,
    arbitrableInterfaceURI: null,
    aliases: {},
    dynamicScriptURI: null,
    arbitratorChainID: { status: "absent" },
    arbitrableChainID: { status: "absent" },
    displayParamsVersion: null,
    realityQuestion: null,
  };
  if (status === "invalid") return { status, reason: "script-not-allowlisted", metaEvidence: value };
  return {
    status,
    metaEvidence: value,
    uri: "/ipfs/QmZZHwJEYi6YFrhSvbDYXuBDT9vC9eCdK7gLaRwP1bYBDP",
    fileUrl: "",
    script: { ran: false, reason: "no-script" },
    source: { kind: "locator", event: "not-read" },
  };
}

const YES_NO = metaEvidence({ type: "single-select", titles: ["Yes", "No"] });
const TEXT = ["Invalid / Refused to Arbitrate / Tied", "Yes", "No"];
const fact = (ruling: bigint) => ({ ruling, rulingText: TEXT[Number(ruling)] ?? ruling.toString() });

function decide(input: {
  readonly court?: bigint;
  readonly period?: ArbitratorDispute["period"];
  readonly ruled?: boolean;
  readonly rules?: AppealRules | null;
  readonly executed?: ExecutedRuling | null;
  readonly funded?: Outcome<readonly bigint[]> | null;
  readonly metaEvidence?: MetaEvidenceResult | null;
}): Outcome<Decision> {
  const dispute = { ...DISPUTE, period: input.period ?? 4, ruled: input.ruled ?? true };
  return buildDecision({
    dispute,
    reads: { ...reads(ok(input.court ?? 1n)), dispute },
    rules: input.rules === undefined ? RULES : input.rules,
    executed: input.executed === undefined ? null : input.executed,
    fundedRulings: input.funded ?? null,
    metaEvidence: input.metaEvidence === undefined ? YES_NO : input.metaEvidence,
  });
}

const applied = (ruling: bigint): ExecutedRuling => ({ status: "executed", ruling });
const NONE_REPORTED: ExecutedRuling = { status: "none-reported" };
const UNREAD: ExecutedRuling = { status: "unread", error: { code: "rpc-error", message: "Could not read the executed ruling: down" } };
const funded = (...rulings: bigint[]) => ok(rulings);
const jury = (court: bigint, note: string) => ({ kind: "jury-decision", court: fact(court), note });
const winner = (ruling: bigint, court: bigint, wonBy: string) => ({ kind: "winner", winner: fact(ruling), court: fact(court), wonBy, noun: "option" });

describe("buildDecision", () => {
  it.each([0, 1, 2] as const)("has no decision in period %i, even without the detail reads", (period) => {
    expect(buildDecision({ dispute: { ...DISPUTE, period }, reads: null, rules: null, executed: null, fundedRulings: null, metaEvidence: null })).toEqual(ok({ kind: "none" }));
  });

  it.each<[string, AppealRoute | null, string]>([
    ["crowdfunded here", "crowdfunding", "appealable"],
    ["paid here (escrow)", "escrow", "appealable"],
    ["a funding dialect the Dispute Resolver does not support", "unsupported", "appealable"],
    ["appealed in the arbitrable application", "arbitrable", "appealable-in-arbitrable"],
    ["an unknown family", null, "appealable-in-arbitrable"],
    ["an arbitrable without an appeal function", "none", "not-appealable"],
  ])("in the appeal period shows the court's ruling and how it is appealed: %s", (_, route, note) => {
    const rules = route === null ? null : { ...RULES, route };
    expect(decide({ period: 3, ruled: false, court: 2n, rules })).toEqual(ok(jury(2n, note)));
  });

  it.each<[string, { readonly ruled?: boolean; readonly court?: bigint; readonly executed?: ExecutedRuling | null; readonly funded?: Outcome<readonly bigint[]> }, object]>([
    ["not executed yet, whatever was funded", { ruled: false, executed: { status: "not-executed" }, funded: funded(2n) }, jury(1n, "not-executed")],
    ["applied the court's ruling", { executed: applied(1n), funded: funded(2n) }, winner(1n, 1n, "jury")],
    ["applied the only fully funded option", { court: 0n, executed: applied(2n), funded: funded(2n) }, winner(2n, 0n, "default")],
    ["applied the only fully funded option, reported funded twice", { executed: applied(2n), funded: funded(2n, 2n) }, winner(2n, 1n, "default")],
    ["applied another ruling with nothing funded", { executed: applied(2n), funded: funded() }, winner(2n, 1n, "applied")],
    ["applied another ruling while the court's was the one funded", { executed: applied(2n), funded: funded(1n) }, winner(2n, 1n, "applied")],
    ["applied another ruling with two options funded", { executed: applied(2n), funded: funded(1n, 2n) }, winner(2n, 1n, "applied")],
    ["applied another ruling whose funding was not read", { executed: applied(2n), funded: NOT_READ }, winner(2n, 1n, "applied")],
    ["applied another ruling, no funding asked for", { executed: applied(2n) }, winner(2n, 1n, "applied")],
    ["reported nothing while another option was the only one funded", { executed: NONE_REPORTED, funded: funded(2n) }, winner(2n, 1n, "default")],
    ["could not be read while another option was the only one funded", { executed: UNREAD, funded: funded(2n) }, winner(2n, 1n, "default")],
    ["has no executed-ruling read while another option was the only one funded", { executed: null, funded: funded(2n) }, winner(2n, 1n, "default")],
    ["reported nothing while the court's ruling was the one funded", { executed: NONE_REPORTED, funded: funded(1n) }, winner(1n, 1n, "jury")],
    ["reported nothing with nothing funded", { executed: NONE_REPORTED, funded: funded() }, winner(1n, 1n, "jury")],
    ["could not be read, nor its funding", { executed: UNREAD, funded: NOT_READ }, winner(1n, 1n, "jury")],
    ["could not be read while a ruling outside the options was funded", { executed: UNREAD, funded: funded(3n) }, winner(1n, 1n, "jury")],
    ["reported a ruling that is not an option", { executed: { status: "out-of-range", ruling: 7n }, funded: funded(2n) }, jury(1n, "out-of-range")],
    ["reported conflicting rulings", { executed: { status: "inconsistent" }, funded: funded(2n) }, jury(1n, "inconsistent")],
  ])("in execution, when the arbitrable %s", (_, input, expected) => {
    expect(decide(input)).toEqual(ok(expected));
  });

  it("names the court's ruling 0 Invalid / Refused to Arbitrate / Tied, and takes the noun from the appeal rules", () => {
    const answer = decide({ court: 0n, executed: applied(2n), funded: funded(2n), rules: { ...RULES, noun: "answer" } });
    expect(answer).toMatchObject(ok({ court: { ruling: 0n, rulingText: "Invalid / Refused to Arbitrate / Tied" }, noun: "answer" }));
    expect(decide({ executed: applied(2n), funded: funded(2n), rules: null })).toMatchObject(ok({ noun: "option" }));
  });

  it("names a ruling with the dispute's options, the placeholder of an invalid meta-evidence, or its decimal value", () => {
    const text = (metaEvidenceResult: MetaEvidenceResult | null) => {
      const decision = decide({ executed: applied(3n), metaEvidence: metaEvidenceResult });
      return decision.ok && decision.value.kind === "winner" ? decision.value.winner.rulingText : null;
    };
    expect(text(metaEvidence({ type: "multiple-select", titles: ["A", "B", "C"] }))).toBe("B");
    expect(text(metaEvidence({ type: "single-select", titles: ["Yes", "No", "Maybe"] }, "invalid"))).toBe("Maybe");
    expect(text(null)).toBe("3");
  });

  it("degrades without the detail reads or the court's ruling, never reading a failure as ruling 0", () => {
    expect(buildDecision({ dispute: DISPUTE, reads: null, rules: RULES, executed: null, fundedRulings: null, metaEvidence: null }).ok).toBe(false);
    expect(buildDecision({ dispute: DISPUTE, reads: reads(NOT_READ), rules: RULES, executed: applied(2n), fundedRulings: null, metaEvidence: null })).toEqual(NOT_READ);
  });
});

describe("decisionNeedsFunding", () => {
  it.each<[string, Partial<ArbitratorDispute>, ExecutedRuling, boolean]>([
    ["the arbitrable applied another ruling than the court's", {}, applied(2n), true],
    ["the arbitrable reported nothing", {}, NONE_REPORTED, true],
    ["the arbitrable's report could not be read", {}, UNREAD, true],
    ["the arbitrable applied the court's ruling", {}, applied(1n), false],
    ["the arbitrable reported a ruling that is not an option", {}, { status: "out-of-range", ruling: 7n }, false],
    ["the arbitrable reported conflicting rulings", {}, { status: "inconsistent" }, false],
    ["the ruling has not been executed", { ruled: false }, { status: "not-executed" }, false],
    ["the dispute is in the appeal period", { period: 3 }, NONE_REPORTED, false],
  ])("in execution with a court ruling of 1, when %s", (_, dispute, executed, expected) => {
    expect(decisionNeedsFunding({ ...DISPUTE, ...dispute }, executed, 1n)).toBe(expected);
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
