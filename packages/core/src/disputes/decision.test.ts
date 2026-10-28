import { describe, expect, it } from "vitest";
import { describeAppealRules } from "../families";
import type { AppealRules } from "../families/types";
import type { MetaEvidence, MetaEvidenceResult } from "../metaEvidence/types";
import { REGISTRY } from "../registry";
import type { Outcome } from "../types";
import { buildDecision, deriveCompatibility, lookupDispute, readDisputeDetails } from ".";
import type { ArbitratorDispute, Compatibility, DisputeReads, ExecutedRuling, LocalIdResolution } from "./types";
import { EXECUTION_GNOSIS, EXECUTION_MAINNET, executionNode, fakeClient, recordedDetection } from "../test/disputes/testHelpers";
import type { ExecutionRecording } from "../test/disputes/testHelpers";

const RESOLVED: LocalIdResolution = { kind: "local-id", value: 0n };
const REFUSED = "invalid / refused to arbitrate / tied";

/** What the Dispute Resolver knows of a contract matched by nothing but its view-only bytecode. */
const VIEW_ONLY: AppealRules = { route: "arbitrable", verified: false, settlement: "unknown", refundsWithoutAppeal: false, tie: null, noun: "option" };
/** Selector-matched crowdfunding the registry has not verified. */
const UNVERIFIED_CROWDFUNDING: AppealRules = {
  route: "crowdfunding",
  verified: false,
  settlement: "unknown",
  refundsWithoutAppeal: false,
  tie: "refuse-is-winner",
  noun: "option",
};

async function verifiedRules(chainId: number, address: string): Promise<AppealRules> {
  const rules = describeAppealRules(REGISTRY, await recordedDetection(chainId, address));
  expect(rules.verified).toBe(true);
  return rules;
}

const PROXY_RULES = () => verifiedRules(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");

function metaEvidenceValue(rulingOptions: MetaEvidence["rulingOptions"]): MetaEvidence {
  return {
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
}

function okResult(metaEvidence: MetaEvidence): MetaEvidenceResult {
  return {
    status: "ok",
    metaEvidence,
    uri: "/ipfs/QmZZHwJEYi6YFrhSvbDYXuBDT9vC9eCdK7gLaRwP1bYBDP",
    fileUrl: "https://cdn.kleros.link/ipfs/QmZZHwJEYi6YFrhSvbDYXuBDT9vC9eCdK7gLaRwP1bYBDP",
    script: { ran: false, reason: "no-script" },
    source: { kind: "locator", event: "not-read" },
  };
}

function metaEvidence(titles: readonly string[]): MetaEvidenceResult {
  return okResult(metaEvidenceValue({ type: "single-select", titles }));
}

interface Recorded {
  readonly dispute: ArbitratorDispute;
  readonly reads: DisputeReads;
}

async function recordedReads(recording: ExecutionRecording, disputeId: bigint): Promise<Recorded> {
  const { client } = fakeClient(executionNode(recording));
  const lookup = await lookupDispute({ chainId: recording.chainId, client }, disputeId);
  if (lookup.status !== "found") throw new Error(`dispute ${String(disputeId)} not found`);
  const reads = await readDisputeDetails({ chainId: recording.chainId, client }, lookup, undefined, null);
  return { dispute: lookup.dispute, reads };
}

/** A recorded dispute moved to another state: period, `ruled` and the current ruling. */
async function withState(
  recording: ExecutionRecording,
  disputeId: bigint,
  state: { readonly period?: 3 | 4; readonly ruled?: boolean; readonly ruling?: bigint },
): Promise<Recorded> {
  const recorded = await recordedReads(recording, disputeId);
  const dispute: ArbitratorDispute = { ...recorded.dispute, period: state.period ?? recorded.dispute.period, ruled: state.ruled ?? recorded.dispute.ruled };
  const currentRuling: Outcome<bigint> = state.ruling === undefined ? recorded.reads.currentRuling : { ok: true, value: state.ruling };
  return { dispute, reads: { ...recorded.reads, dispute, currentRuling } };
}

const executed = (ruling: bigint): ExecutedRuling => ({ status: "executed", ruling });
const UNREAD: ExecutedRuling = { status: "unread", error: { code: "rpc-error", message: "Could not read the executed ruling: HTTP request failed." } };
const funded = (...rulings: bigint[]): Outcome<readonly bigint[]> => ({ ok: true, value: rulings });
const NOT_FUNDED_READ: Outcome<never> = { ok: false, error: { code: "rpc-error", message: "Could not read the appeal funding." } };

describe("buildDecision before execution", () => {
  it("has no decision before the appeal period, even without the detail reads", async () => {
    const { dispute } = await recordedReads(EXECUTION_MAINNET, 1495n);
    for (const period of [0, 1, 2] as const) {
      expect(buildDecision({ dispute: { ...dispute, period }, reads: null, rules: null, executed: null, fundedRulings: null, metaEvidence: null })).toEqual({
        ok: true,
        value: { kind: "none" },
      });
    }
  });

  it("in the appeal period the jury decision is the current ruling, with the contract's appeal route and rules", async () => {
    const { dispute, reads } = await withState(EXECUTION_MAINNET, 1347n, { period: 3, ruled: false, ruling: 2n });
    const rules = await PROXY_RULES();
    expect(buildDecision({ dispute, reads, rules, executed: null, fundedRulings: null, metaEvidence: metaEvidence(["Yes", "No"]) })).toEqual({
      ok: true,
      value: {
        kind: "jury-decision",
        jury: { ruling: 2n, rulingText: "No", zeroReason: null },
        route: "crowdfunding",
        verified: true,
        settlement: "sole-funded-wins",
        noun: "option",
      },
    });
  });

  it.each([
    ["a tied vote", EXECUTION_MAINNET, 1495n, "tie"],
    ["a round nobody voted in", EXECUTION_MAINNET, 108n, "no-votes"],
    ["a majority for refusing", EXECUTION_MAINNET, 1684n, "refused"],
    ["a tied appeal round", EXECUTION_GNOSIS, 939n, "tie"],
  ] as const)("gives the reason for a ruling of 0 in the appeal period: %s", async (_, recording, disputeId, reason) => {
    const { dispute, reads } = await withState(recording, disputeId, { period: 3, ruled: false });
    const decision = buildDecision({ dispute, reads, rules: VIEW_ONLY, executed: null, fundedRulings: null, metaEvidence: null });
    expect(decision).toMatchObject({ ok: true, value: { kind: "jury-decision", jury: { ruling: 0n, rulingText: REFUSED, zeroReason: reason } } });
  });

  it("gives no reason for a ruling of 0 when the vote counter could not be read", async () => {
    const { dispute, reads } = await withState(EXECUTION_MAINNET, 1495n, { period: 3, ruled: false });
    const unread: DisputeReads = { ...reads, lastRoundVotes: { ok: false, error: { code: "rpc-error", message: "down" } } };
    expect(buildDecision({ dispute, reads: unread, rules: VIEW_ONLY, executed: null, fundedRulings: null, metaEvidence: null })).toMatchObject({
      ok: true,
      value: { jury: { ruling: 0n, zeroReason: null } },
    });
  });

  it("an unknown family still has a jury decision, with no appeal route and no verified rules", async () => {
    const { dispute, reads } = await withState(EXECUTION_MAINNET, 1347n, { period: 3, ruled: false, ruling: 1n });
    expect(buildDecision({ dispute, reads, rules: null, executed: null, fundedRulings: null, metaEvidence: null })).toEqual({
      ok: true,
      value: { kind: "jury-decision", jury: { ruling: 1n, rulingText: "1", zeroReason: null }, route: null, verified: false, settlement: "unknown", noun: "option" },
    });
  });

  it("a failed current ruling degrades the decision only, never reading as ruling 0", async () => {
    const { dispute, reads } = await withState(EXECUTION_MAINNET, 1495n, { period: 3 });
    const failed: Outcome<never> = { ok: false, error: { code: "rpc-error", message: "Could not read the current ruling: header not found." } };
    expect(buildDecision({ dispute, reads: { ...reads, currentRuling: failed }, rules: VIEW_ONLY, executed: null, fundedRulings: null, metaEvidence: null })).toEqual(failed);
  });

  it("details that were not read degrade the decision", async () => {
    const { dispute } = await withState(EXECUTION_MAINNET, 1495n, { period: 3 });
    expect(buildDecision({ dispute, reads: null, rules: VIEW_ONLY, executed: null, fundedRulings: null, metaEvidence: null }).ok).toBe(false);
  });
});

describe("buildDecision in execution", () => {
  it("names the executed ruling the winner by default on a verified contract that let the only funded option win", async () => {
    const { dispute, reads } = await recordedReads(EXECUTION_MAINNET, 199n);
    const rules = await verifiedRules(1, "0x135c573503f70dc290b1d60fe2e7f7eb114febd6");
    expect(buildDecision({ dispute, reads, rules, executed: executed(1n), fundedRulings: null, metaEvidence: metaEvidence(["Yes", "No"]) })).toEqual({
      ok: true,
      value: {
        kind: "winner",
        winner: { ruling: 1n, rulingText: "Yes" },
        jury: { ruling: 0n, rulingText: REFUSED, zeroReason: "refused" },
        wonBy: "default",
        verified: true,
        execution: "executed",
        note: null,
        noun: "option",
      },
    });
  });

  it("attributes a different executed ruling to the arbitrable contract when its rules are not verified", async () => {
    const { dispute, reads } = await recordedReads(EXECUTION_GNOSIS, 939n);
    expect(buildDecision({ dispute, reads, rules: VIEW_ONLY, executed: executed(2n), fundedRulings: null, metaEvidence: metaEvidence(["Register", "Reject"]) })).toEqual({
      ok: true,
      value: {
        kind: "winner",
        winner: { ruling: 2n, rulingText: "Reject" },
        jury: { ruling: 0n, rulingText: REFUSED, zeroReason: "tie" },
        wonBy: "reported",
        verified: false,
        execution: "executed",
        note: null,
        noun: "option",
      },
    });
  });

  it("says won by jury decision when the executed ruling is the jury's own", async () => {
    const { dispute, reads } = await recordedReads(EXECUTION_MAINNET, 150n);
    const rules = await verifiedRules(1, "0x594ec762b59978c97c82bc36ab493ed8b1f1f368");
    expect(buildDecision({ dispute, reads, rules, executed: executed(0n), fundedRulings: null, metaEvidence: null })).toMatchObject({
      ok: true,
      value: { kind: "winner", winner: { ruling: 0n }, wonBy: "jury", verified: true, execution: "executed", note: null, noun: "answer" },
    });
  });

  it("attributes an unverified contract's report of the jury's own ruling to the contract, never to the jury", async () => {
    const { dispute, reads } = await withState(EXECUTION_MAINNET, 1347n, { ruling: 2n });
    expect(buildDecision({ dispute, reads, rules: VIEW_ONLY, executed: executed(2n), fundedRulings: null, metaEvidence: null })).toMatchObject({
      ok: true,
      value: { kind: "winner", winner: { ruling: 2n }, wonBy: "reported", verified: false, execution: "executed" },
    });
    const crowdfunding = buildDecision({ dispute, reads, rules: UNVERIFIED_CROWDFUNDING, executed: executed(2n), fundedRulings: funded(), metaEvidence: null });
    expect(crowdfunding).toMatchObject({ ok: true, value: { kind: "winner", wonBy: "reported", verified: false } });
  });

  it("an unverified contract that reported the jury's ruling of 0 before the court ruled is still only reporting it", async () => {
    const { dispute, reads } = await recordedReads(EXECUTION_GNOSIS, 939n);
    expect(buildDecision({ dispute, reads, rules: VIEW_ONLY, executed: executed(0n), fundedRulings: null, metaEvidence: metaEvidence(["Register", "Reject"]) })).toMatchObject({
      ok: true,
      value: { kind: "winner", winner: { ruling: 0n }, jury: { ruling: 0n, zeroReason: "tie" }, wonBy: "reported", verified: false },
    });
  });

  it("attributes an unexpected ruling to the contract even when its rules are verified and the jury's ruling should stand", async () => {
    const { dispute, reads } = await withState(EXECUTION_MAINNET, 1347n, { ruling: 1n });
    const rules = await verifiedRules(100, "0xaeecfa44639b61d2e0a9534d918789d94a24a9de");
    expect(buildDecision({ dispute, reads, rules, executed: executed(2n), fundedRulings: funded(), metaEvidence: null })).toMatchObject({
      ok: true,
      value: { kind: "winner", winner: { ruling: 2n }, jury: { ruling: 1n }, wonBy: "reported", verified: true },
    });
  });

  it("says won by jury decision when the only funded option is the jury's own ruling", async () => {
    const rules = await PROXY_RULES();
    const pending = await withState(EXECUTION_MAINNET, 1347n, { ruled: false, ruling: 2n });
    expect(buildDecision({ ...pending, rules, executed: { status: "not-executed" }, fundedRulings: funded(2n), metaEvidence: null })).toMatchObject({
      ok: true,
      value: { kind: "winner", winner: { ruling: 2n }, wonBy: "jury", execution: "pending" },
    });
    const done = await withState(EXECUTION_MAINNET, 1347n, { ruling: 2n });
    expect(buildDecision({ ...done, rules, executed: { status: "none-reported" }, fundedRulings: funded(2n), metaEvidence: null })).toMatchObject({
      ok: true,
      value: { kind: "winner", winner: { ruling: 2n }, wonBy: "jury", execution: "unconfirmed", note: "none-reported" },
    });
  });

  it("predicts the default winner before execution on a verified contract", async () => {
    const { dispute, reads } = await withState(EXECUTION_MAINNET, 1347n, { ruled: false, ruling: 1n });
    expect(buildDecision({ dispute, reads, rules: await PROXY_RULES(), executed: { status: "not-executed" }, fundedRulings: funded(2n), metaEvidence: null })).toMatchObject({
      ok: true,
      value: { kind: "winner", winner: { ruling: 2n }, jury: { ruling: 1n }, wonBy: "default", verified: true, execution: "pending", note: null },
    });
  });

  it("predicts the jury's ruling before execution where the jury's ruling stands or there is no appeal", async () => {
    const { dispute, reads } = await withState(EXECUTION_MAINNET, 1347n, { ruled: false, ruling: 1n });
    const yubiai = await verifiedRules(100, "0xaeecfa44639b61d2e0a9534d918789d94a24a9de");
    const oldReality = await verifiedRules(1, "0x594ec762b59978c97c82bc36ab493ed8b1f1f368");
    for (const rules of [yubiai, oldReality]) {
      expect(buildDecision({ dispute, reads, rules, executed: { status: "not-executed" }, fundedRulings: null, metaEvidence: null })).toMatchObject({
        ok: true,
        value: { kind: "winner", winner: { ruling: 1n }, wonBy: "jury", execution: "pending" },
      });
    }
  });

  it("shows the jury ruling as not executed yet where the contract's rules are not verified", async () => {
    for (const [disputeId, reason] of [
      [108n, "no-votes"],
      [1684n, "refused"],
    ] as const) {
      const { dispute, reads } = await recordedReads(EXECUTION_MAINNET, disputeId);
      expect(buildDecision({ dispute, reads, rules: VIEW_ONLY, executed: { status: "not-executed" }, fundedRulings: null, metaEvidence: null })).toEqual({
        ok: true,
        value: { kind: "jury-ruling", jury: { ruling: 0n, rulingText: REFUSED, zeroReason: reason }, execution: "pending", noun: "option" },
      });
    }
  });

  it("falls back to the funding with a note when the executed ruling cannot be read", async () => {
    const { dispute, reads } = await withState(EXECUTION_MAINNET, 1347n, { ruling: 1n });
    expect(buildDecision({ dispute, reads, rules: await PROXY_RULES(), executed: UNREAD, fundedRulings: funded(2n), metaEvidence: null })).toMatchObject({
      ok: true,
      value: { kind: "winner", winner: { ruling: 2n }, wonBy: "default", execution: "unconfirmed", note: "unread" },
    });
  });

  it.each([
    ["reported nothing", { status: "none-reported" }, "none-reported"],
    ["reported different rulings", { status: "inconsistent" }, "inconsistent"],
    ["reported a ruling that is not an option", { status: "out-of-range", ruling: 7n }, "out-of-range"],
    ["could not be read", UNREAD, "unread"],
  ] as const)("degrades to the jury ruling when an unverified contract %s", async (_, outcome, note) => {
    const { dispute, reads } = await recordedReads(EXECUTION_GNOSIS, 939n);
    expect(buildDecision({ dispute, reads, rules: UNVERIFIED_CROWDFUNDING, executed: outcome, fundedRulings: funded(2n), metaEvidence: null })).toEqual({
      ok: true,
      value: { kind: "jury-ruling", jury: { ruling: 0n, rulingText: REFUSED, zeroReason: "tie" }, execution: note, noun: "option" },
    });
  });

  it("degrades to the jury ruling on a verified contract when neither the executed ruling nor the funding could be read", async () => {
    const { dispute, reads } = await withState(EXECUTION_MAINNET, 1347n, { ruling: 1n });
    expect(buildDecision({ dispute, reads, rules: await PROXY_RULES(), executed: UNREAD, fundedRulings: NOT_FUNDED_READ, metaEvidence: null })).toMatchObject({
      ok: true,
      value: { kind: "jury-ruling", jury: { ruling: 1n }, execution: "unread" },
    });
  });

  it("an executed ruling that was not read in execution degrades the decision instead of guessing", async () => {
    const { dispute, reads } = await recordedReads(EXECUTION_GNOSIS, 939n);
    expect(buildDecision({ dispute, reads, rules: VIEW_ONLY, executed: null, fundedRulings: null, metaEvidence: null }).ok).toBe(false);
  });

  it("names a ruling with the dispute's options, or its decimal value without them", async () => {
    const { dispute, reads } = await recordedReads(EXECUTION_GNOSIS, 939n);
    const named = buildDecision({ dispute, reads, rules: VIEW_ONLY, executed: executed(2n), fundedRulings: null, metaEvidence: metaEvidence(["Register", "Reject"]) });
    const bare = buildDecision({ dispute, reads, rules: VIEW_ONLY, executed: executed(2n), fundedRulings: null, metaEvidence: null });
    expect(named).toMatchObject({ value: { winner: { rulingText: "Reject" } } });
    expect(bare).toMatchObject({ value: { winner: { rulingText: "2" } } });
  });

  it("names a multiple-select ruling by its combination, and takes the options of an invalid meta-evidence's placeholder", async () => {
    const { dispute, reads } = await recordedReads(EXECUTION_GNOSIS, 939n);
    const combinations = okResult(metaEvidenceValue({ type: "multiple-select", titles: ["A", "B", "C"] }));
    expect(buildDecision({ dispute, reads, rules: VIEW_ONLY, executed: executed(3n), fundedRulings: null, metaEvidence: combinations })).toMatchObject({
      value: { winner: { rulingText: "B" } },
    });
    const placeholder: MetaEvidenceResult = {
      status: "invalid",
      reason: "script-not-allowlisted",
      metaEvidence: metaEvidenceValue({ type: "single-select", titles: ["Yes", "No"] }),
    };
    expect(buildDecision({ dispute, reads, rules: VIEW_ONLY, executed: executed(2n), fundedRulings: null, metaEvidence: placeholder })).toMatchObject({
      value: { winner: { rulingText: "No" } },
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
