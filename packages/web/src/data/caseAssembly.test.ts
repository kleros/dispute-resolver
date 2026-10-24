import type { AppealInfo, FamilyDetection, MetaEvidenceResult, Multipliers, Period, Unavailable, WithdrawState } from "@dispute-resolver/core";
import { describe, expect, it } from "vitest";
import { sectionLoading, sectionReady, testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence } from "../test/data";
import { assembleAppealPanel, assembleView, type FoundCaseReads } from "./caseAssembly";

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
  capabilities: { localId: "externalIDtoLocalID", evidence: { kind: "local-id" }, appeal: { kind: "idr", fundAppeal: "fundAppeal(uint256,uint256)" }, withdraw: { kind: "idr-v1" } },
});
const WITHDRAW: WithdrawState = { status: "available", beneficiary: "0x00000000000000000000000000000000000000a1", total: 5n, items: [{ dialect: "idr-v1", ruling: 1n, amount: 5n }] };
const IPFS_DOWN: Unavailable = { code: "rpc-error", message: "The meta-evidence file could not be fetched." };

function readsWith(family: FamilyDetection, period: Period, metaEvidence: FoundCaseReads["metaEvidence"]): FoundCaseReads {
  const lookup = testFoundLookup({ period });
  return {
    lookup,
    family: sectionReady(family),
    metaEvidence,
    courts: sectionReady([testCourt()]),
    details: sectionReady(testDetails(lookup, { appealInfo: { ok: true, value: APPEAL_INFO } })),
    appeal: {
      multipliers: period === 3 ? sectionReady(MULTIPLIERS) : null,
      funding: period === 3 ? sectionReady({ round: 0n, contributions: [], fundedRulings: [] }) : null,
      withdraw: period === 4 ? sectionReady(WITHDRAW) : null,
    },
    override: undefined,
    readClient: undefined,
  };
}

const MISSING: MetaEvidenceResult = { status: "missing" };
const FAILED: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: IPFS_DOWN };

describe("case assembly", () => {
  it("a period-3 dispute whose current-ruling read failed shows its decision as unavailable and its appeal fees as not calculable, with the read's reason", () => {
    const lookup = testFoundLookup({ period: 3 });
    const failed: Unavailable = { code: "rpc-error", message: "Could not read the current ruling: the RPC did not answer." };
    const reads: FoundCaseReads = {
      lookup,
      family: sectionReady(testFamily()),
      metaEvidence: sectionReady(testOkMetaEvidence()),
      courts: sectionReady([testCourt()]),
      details: sectionReady(testDetails(lookup, { currentRuling: { ok: false, error: failed }, appealInfo: { ok: true, value: APPEAL_INFO } })),
      appeal: { multipliers: sectionReady(MULTIPLIERS), funding: sectionReady({ round: 0n, contributions: [], fundedRulings: [] }), withdraw: null },
      override: undefined,
      readClient: undefined,
    };
    expect(assembleView(reads)).toMatchObject({ status: "ready", value: { exists: true, period: 3, decision: { ok: false, error: failed } } });
    expect(assembleAppealPanel(reads)).toEqual({ status: "ready", value: { kind: "fees-unavailable", error: failed } });
  });

  it("an Escrow V1 dispute in the appeal period offers its appeal even without meta-evidence", () => {
    expect(assembleAppealPanel(readsWith(ESCROW_V1, 3, sectionReady(MISSING)))).toEqual({
      status: "ready",
      value: { kind: "escrow-appeal", appealCost: APPEAL_INFO.appealCost, deadline: APPEAL_INFO.appealPeriodEnd },
    });
  });

  it("an Escrow V1 dispute in the appeal period does not wait for its meta-evidence", () => {
    expect(assembleAppealPanel(readsWith(ESCROW_V1, 3, sectionLoading))).toMatchObject({ status: "ready", value: { kind: "escrow-appeal" } });
  });

  it("an IDisputeResolver v1 dispute in execution offers its withdrawal even when its meta-evidence failed to load", () => {
    expect(assembleAppealPanel(readsWith(IDR_V1, 4, sectionReady(FAILED)))).toEqual({ status: "ready", value: { kind: "withdraw", state: WITHDRAW } });
  });

  it("an arbitrable that handles its own appeals says so even when its meta-evidence failed to load", () => {
    const viewOnly = testFamily({ family: "view-only", writeFamily: "view-only", capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "none" }, withdraw: { kind: "none" } } });
    expect(assembleAppealPanel(readsWith(viewOnly, 3, sectionReady(FAILED)))).toEqual({ status: "ready", value: { kind: "handled-by-arbitrable" } });
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
