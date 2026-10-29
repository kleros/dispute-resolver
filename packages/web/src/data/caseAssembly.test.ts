import {
  REGISTRY,
  describeAppealRules,
  type AppealInfo,
  type DisputeReads,
  type ExecutedRuling,
  type FamilyDetection,
  type MetaEvidenceResult,
  type Multipliers,
  type Period,
  type RoundFunding,
  type Unavailable,
  type WithdrawState,
} from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { sectionLoading, sectionReady, sectionUnavailable, testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence } from "../test/data";
import { assembleAppealPanel, assembleDecision, assembleView, type FoundCaseReads } from "./caseAssembly";
import type { SectionData } from "./types";

const APPEAL_INFO: AppealInfo = { appealCost: 1_000n, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 };
const MULTIPLIERS: Multipliers = { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n };
const ESCROW_V1 = testFamily({
  family: "escrow-v1",
  writeFamily: "escrow-v1",
  capabilities: { localId: "disputeIDtoTransactionID", evidence: { kind: "local-id" }, appeal: { kind: "escrow-pay-cost" }, withdraw: { kind: "none" } },
});
const IDR_V1 = testFamily({
  family: "idr-v1",
  writeFamily: "idr-v1",
  capabilities: {
    localId: "externalIDtoLocalID",
    evidence: { kind: "local-id" },
    appeal: { kind: "idr" },
    withdraw: { kind: "idr-v1" },
  },
});
const VIEW_ONLY = testFamily({
  family: "view-only",
  writeFamily: "view-only",
  capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } },
});
const WITHDRAW: WithdrawState = {
  status: "available",
  beneficiary: "0x00000000000000000000000000000000000000a1",
  total: 5n,
  items: [{ dialect: "idr-v1", ruling: 1n, amount: 5n }],
};
const IPFS_DOWN: Unavailable = { code: "rpc-error", message: "The meta-evidence file could not be fetched." };

interface ReadsOptions {
  readonly details?: Partial<DisputeReads>;
  readonly ruled?: boolean;
  readonly funding?: SectionData<RoundFunding> | null;
  readonly executed?: SectionData<ExecutedRuling> | null;
  readonly productFunding?: SectionData<readonly bigint[]> | null;
}

/** What `useExecutedRuling` gives a dispute the arbitrator has not executed: nothing outside execution. */
function notExecuted(period: Period): SectionData<ExecutedRuling> | null {
  return period === 4 ? sectionReady({ status: "not-executed" }) : null;
}

function readsWith(family: FamilyDetection, period: Period, metaEvidence: FoundCaseReads["metaEvidence"], options: ReadsOptions = {}): FoundCaseReads {
  const lookup = testFoundLookup({ period, ruled: options.ruled ?? false });
  const noFunding = period >= 3 ? sectionReady({ round: 0n, contributions: [], fundedRulings: [] }) : null;
  return {
    lookup,
    family: sectionReady(family),
    rules: describeAppealRules(REGISTRY, family),
    metaEvidence,
    courts: sectionReady([testCourt()]),
    details: sectionReady(testDetails(lookup, { appealInfo: { ok: true, value: APPEAL_INFO }, ...options.details })),
    appeal: {
      multipliers: period === 3 ? sectionReady(MULTIPLIERS) : null,
      funding: options.funding === undefined ? noFunding : options.funding,
      withdraw: period === 4 ? sectionReady(WITHDRAW) : null,
    },
    executed: options.executed === undefined ? notExecuted(period) : options.executed,
    productFunding: options.productFunding ?? null,
    override: undefined,
    readClient: undefined,
  };
}

const MISSING: MetaEvidenceResult = { status: "missing" };
const FAILED: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: IPFS_DOWN };

const ESCROW_APPEAL = { status: "ready", value: { kind: "escrow-appeal", appealCost: APPEAL_INFO.appealCost, deadline: APPEAL_INFO.appealPeriodEnd } };

describe("case assembly", () => {
  it("a period-3 dispute whose current-ruling read failed shows its decision as unavailable and its appeal fees as not calculable, with the read's reason", () => {
    const failed: Unavailable = { code: "rpc-error", message: "Could not read the current ruling: the RPC did not answer." };
    const reads = readsWith(testFamily(), 3, sectionReady(testOkMetaEvidence()), { details: { currentRuling: { ok: false, error: failed } } });
    expect(assembleDecision(reads)).toEqual({ status: "unavailable", error: failed });
    expect(assembleView(reads)).toMatchObject({ status: "ready", value: { exists: true, period: 3 } });
    expect(assembleAppealPanel(reads)).toEqual({ status: "ready", value: { kind: "fees-unavailable", error: failed } });
  });

  it("the dispute view no longer waits for the funding scan", () => {
    const reads = readsWith(testFamily(), 4, sectionReady(testOkMetaEvidence()), { funding: sectionLoading, executed: sectionLoading });
    expect(assembleView(reads)).toMatchObject({ status: "ready", value: { exists: true, period: 4 } });
  });

  it("a dispute before the appeal period has no decision and waits for nothing", () => {
    const reads = readsWith(testFamily(), 2, sectionLoading, { details: {} });
    expect(assembleDecision({ ...reads, details: sectionLoading })).toEqual({ status: "ready", value: { kind: "none" } });
  });

  it("the appeal-period decision says how the dispute's own contract is appealed", () => {
    expect(assembleDecision(readsWith(VIEW_ONLY, 3, sectionReady(testOkMetaEvidence())))).toMatchObject({
      status: "ready",
      value: { kind: "jury-decision", note: "appealable-in-arbitrable", court: { ruling: 1n, rulingText: "Yes" } },
    });
  });

  const funded = (rulings: readonly bigint[]): SectionData<RoundFunding> => sectionReady({ round: 0n, contributions: [], fundedRulings: rulings });
  const applied = (ruling: bigint): SectionData<ExecutedRuling> => sectionReady({ status: "executed", ruling });
  const noReport: SectionData<ExecutedRuling> = sectionReady({ status: "none-reported" });
  it.each([
    ["the arbitrable applied the court's ruling", VIEW_ONLY, { executed: applied(1n), productFunding: sectionLoading }, { kind: "winner", wonBy: "jury", winner: { ruling: 1n } }],
    ["its own funding record is still read", VIEW_ONLY, { executed: applied(2n), productFunding: sectionLoading }, null],
    [
      "its own funding record shows the applied ruling alone",
      VIEW_ONLY,
      { executed: applied(2n), productFunding: sectionReady([2n]) },
      { kind: "winner", wonBy: "default", winner: { ruling: 2n, rulingText: "No" } },
    ],
    [
      "its own funding record could not be read",
      VIEW_ONLY,
      { executed: applied(2n), productFunding: sectionUnavailable("not-found", "No proof.") },
      { kind: "winner", wonBy: "applied", winner: { ruling: 2n } },
    ],
    ["the round's funding is still read", testFamily(), { executed: noReport, funding: sectionLoading }, null],
    ["the round's funding shows another ruling alone", testFamily(), { executed: noReport, funding: funded([2n]) }, { kind: "winner", wonBy: "default", winner: { ruling: 2n } }],
  ] as const)("an executed decision when %s", (_case, family, options: ReadsOptions, decision) => {
    const reads = readsWith(family, 4, sectionReady(testOkMetaEvidence()), { ruled: true, ...options });
    expect(assembleDecision(reads)).toMatchObject(decision === null ? { status: "loading" } : { status: "ready", value: decision });
  });

  it("in execution the decision waits for the executed ruling", () => {
    const reads = readsWith(VIEW_ONLY, 4, sectionReady(testOkMetaEvidence()), { ruled: true, funding: null, executed: sectionLoading });
    expect(assembleDecision(reads)).toEqual({ status: "loading" });
  });

  it("an executed ruling that could not be read, without funding that proves another ruling, leaves the court's ruling the winner", () => {
    const error: Unavailable = { code: "rpc-error", message: "Could not read the executed ruling: the RPC did not answer." };
    const reads = readsWith(VIEW_ONLY, 4, sectionReady(testOkMetaEvidence()), { ruled: true, funding: null, executed: sectionUnavailable(error.code, error.message) });
    expect(assembleDecision(reads)).toMatchObject({ status: "ready", value: { kind: "winner", wonBy: "jury", winner: { ruling: 1n } } });
  });

  it("a failed details read degrades the decision with its own reason", () => {
    const reads = readsWith(testFamily(), 3, sectionReady(testOkMetaEvidence()));
    expect(assembleDecision({ ...reads, details: sectionUnavailable("rpc-error", "The dispute could not be read.") })).toEqual({
      status: "unavailable",
      error: { code: "rpc-error", message: "The dispute could not be read." },
    });
  });

  it("an unknown family still shows the jury's decision, without the contract's appeal rules", () => {
    const reads = readsWith(testFamily(), 3, sectionReady(testOkMetaEvidence()));
    const decision = assembleDecision({ ...reads, family: sectionUnavailable("rpc-error", "eth_getCode failed"), rules: null });
    expect(decision).toMatchObject({ status: "ready", value: { kind: "jury-decision", note: "appealable-in-arbitrable" } });
  });

  it("an Escrow V1 dispute in the appeal period offers its appeal even without meta-evidence", () => {
    expect(assembleAppealPanel(readsWith(ESCROW_V1, 3, sectionReady(MISSING)))).toEqual(ESCROW_APPEAL);
  });

  it("an Escrow V1 dispute in the appeal period does not wait for its meta-evidence", () => {
    expect(assembleAppealPanel(readsWith(ESCROW_V1, 3, sectionLoading))).toEqual(ESCROW_APPEAL);
  });

  it("an IDisputeResolver v1 dispute in execution offers its withdrawal even when its meta-evidence failed to load", () => {
    expect(assembleAppealPanel(readsWith(IDR_V1, 4, sectionReady(FAILED)))).toEqual({ status: "ready", value: { kind: "withdraw", state: WITHDRAW } });
  });

  it("an arbitrable that handles its own appeals says so even when its meta-evidence failed to load", () => {
    expect(assembleAppealPanel(readsWith(VIEW_ONLY, 3, sectionReady(FAILED)))).toEqual({ status: "ready", value: { kind: "handled-by-arbitrable" } });
  });

  it("an IDisputeResolver v1 dispute in the appeal period without meta-evidence has no appeal cards, because its ruling options are unknown", () => {
    expect(assembleAppealPanel(readsWith(IDR_V1, 3, sectionReady(MISSING)))).toEqual({
      status: "unavailable",
      error: { code: "not-found", message: "This dispute has no meta-evidence, so its ruling options are unknown." },
    });
  });

  it("an IDisputeResolver v1 dispute in the appeal period waits for its meta-evidence before showing appeal cards", () => {
    expect(assembleAppealPanel(readsWith(IDR_V1, 3, sectionLoading))).toEqual({ status: "loading" });
  });
});
