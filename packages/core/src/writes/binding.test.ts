import { describe, expect, expectTypeOf, it } from "vitest";
import type { WithdrawItem } from "../appeals/types";
import type { ArbitratedBinding } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import type { WriteCall } from "../types";
import { buildEscrowAppealCall, buildFundAppealCall, buildSubmitEvidenceCall, buildWithdrawCalls } from "./index";
import { BENEFICIARY, detectionFor, EVIDENCE_CID, FAMILY_SIGNATURES, localIdFor, recordedDetections, selectorOf, testBinding } from "../test/writes/testHelpers";
import type { WriteBuild } from "./types";

const EVIDENCE = `/ipfs/${EVIDENCE_CID}/evidence.json`;
const ARBITRATED = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
const SPOOFED = "0x000000000000000000000000000000000000dead";

const WITHDRAW_ITEMS: readonly WithdrawItem[] = [
  { dialect: "idr-v2", ruling: 1n, amount: 1n },
  { dialect: "idr-v1", ruling: 1n, amount: 1n },
  { dialect: "governor", session: 0n, round: 0n, listIndex: 0n, amount: 1n },
];

function everyBuild(binding: ArbitratedBinding, family: FamilyDetection): readonly WriteBuild[] {
  const localId = localIdFor(family, 1n);
  return [
    buildSubmitEvidenceCall({ binding, family, localId, evidenceUri: EVIDENCE }),
    buildFundAppealCall({ binding, family, localId, ruling: 1n, value: 1n }),
    buildEscrowAppealCall({ binding, family, localId, appealCost: 1n }),
    ...buildWithdrawCalls({ binding, family, localId, beneficiary: BENEFICIARY, items: WITHDRAW_ITEMS }),
  ];
}

function callsOf(builds: readonly WriteBuild[]): WriteCall[] {
  return builds.flatMap((build) => (build.ok ? [build.call] : []));
}

describe("write target binding", () => {
  it("every call targets the arbitrable the arbitrator names, on the arbitrator's chain", () => {
    for (const name of Object.keys(FAMILY_SIGNATURES) as (keyof typeof FAMILY_SIGNATURES)[]) {
      for (const chainId of [1, 100]) {
        const binding = testBinding({ chainId, disputeId: 5n, arbitrated: ARBITRATED });
        for (const call of callsOf(everyBuild(binding, detectionFor(ARBITRATED, FAMILY_SIGNATURES[name], chainId)))) {
          expect(call.address).toBe(ARBITRATED);
          expect(call.chainId).toBe(chainId);
        }
      }
    }
  });

  it("a family detected for another address (one meta-evidence names) cannot redirect or re-dialect a write", () => {
    const binding = testBinding({ chainId: 1, disputeId: 5n, arbitrated: ARBITRATED });
    const spoofed = detectionFor(SPOOFED, FAMILY_SIGNATURES["idr-v2"]);
    const builds = everyBuild(binding, spoofed);
    expect(callsOf(builds)).toEqual([]);
    expect(builds.every((build) => !build.ok && build.refusal === "family-mismatch")).toBe(true);
  });

  it("a family detected on another chain cannot be used for the binding's dispute", () => {
    const binding = testBinding({ chainId: 1, disputeId: 5n, arbitrated: ARBITRATED });
    const builds = everyBuild(binding, detectionFor(ARBITRATED, FAMILY_SIGNATURES["idr-v2"], 100));
    expect(builds.every((build) => !build.ok && build.refusal === "family-mismatch")).toBe(true);
  });

  it("the builders accept only an ArbitratedBinding, never a bare address", () => {
    const fromMetaEvidence = { chainId: 1, disputeId: 5n, arbitrator: ARBITRATED, arbitrated: ARBITRATED } as const;
    expectTypeOf(fromMetaEvidence).not.toExtend<ArbitratedBinding>();
    expectTypeOf<Parameters<typeof buildSubmitEvidenceCall>[0]["binding"]>().toEqualTypeOf<ArbitratedBinding>();
    expectTypeOf<Parameters<typeof buildFundAppealCall>[0]["binding"]>().toEqualTypeOf<ArbitratedBinding>();
    expectTypeOf<Parameters<typeof buildEscrowAppealCall>[0]["binding"]>().toEqualTypeOf<ArbitratedBinding>();
    expectTypeOf<Parameters<typeof buildWithdrawCalls>[0]["binding"]>().toEqualTypeOf<ArbitratedBinding>();
  });

  it("every call built for a recorded contract uses a selector its dispatcher carries", () => {
    const families = new Set<string>();
    for (const { label, detection, dispatcher } of recordedDetections()) {
      const binding = testBinding({ chainId: detection.chainId, disputeId: 1n, arbitrated: detection.arbitrable });
      const calls = callsOf(everyBuild(binding, detection));
      for (const call of calls) {
        expect(dispatcher.has(selectorOf(call)), `${label}: ${call.functionName}`).toBe(true);
      }
      if (detection.writeFamily === "view-only") expect(calls, label).toEqual([]);
      else expect(calls.length, label).toBeGreaterThan(0);
      families.add(detection.writeFamily);
    }
    expect(families).toEqual(new Set(["escrow-v1", "governor", "idr-legacy", "idr-v1", "idr-v2", "view-only"]));
  });
});
