import type {
  Address,
  ArbitratedBinding,
  ArbitratorDispute,
  CanonicalIpfsPath,
  ChainId,
  Court,
  DisputeLookup,
  DisputeReads,
  FamilyDetection,
  MetaEvidence,
  MetaEvidenceResult,
  Period,
} from "@dispute-resolver/core";
import { testMetaEvidence } from "../safe-content";

export const TEST_ARBITRATOR: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
export const TEST_ARBITRABLE: Address = "0xc5e9ddebb09cd64dfacab4011a0d5cedaf7c9bdb";
export const TEST_META_EVIDENCE_URI: CanonicalIpfsPath = "/ipfs/QmQ2XoA25HmnPUEWDduxj6LYwMwp6jtXPFRMHcNF2EvJfU/metaEvidence.json";

/**
 * A binding as `lookupDispute` returns it. Only core constructs `ArbitratedBinding` in the app (A22); a test builds
 * one through this cast to stand in for a lookup it does not run.
 */
export function testBinding(overrides: Partial<Omit<ArbitratedBinding, symbol>> = {}): ArbitratedBinding {
  const binding = { chainId: 1, disputeId: 1n, arbitrator: TEST_ARBITRATOR, arbitrated: TEST_ARBITRABLE, ...overrides };
  return binding as unknown as ArbitratedBinding;
}

export function testDispute(overrides: Partial<ArbitratorDispute> = {}): ArbitratorDispute {
  return { id: 1n, subcourtId: 0n, arbitrated: TEST_ARBITRABLE, numberOfChoices: 2n, period: 0, lastPeriodChange: 1_700_000_000, ruled: false, ...overrides };
}

/** A `found` lookup of dispute `disputeId` on `chainId` in `period`. */
export function testFoundLookup(options: { readonly chainId?: ChainId; readonly disputeId?: bigint; readonly period?: Period; readonly arbitrable?: Address } = {}): Extract<DisputeLookup, { status: "found" }> {
  const { chainId = 1, disputeId = 1n, period = 0, arbitrable = TEST_ARBITRABLE } = options;
  return {
    status: "found",
    dispute: testDispute({ id: disputeId, period, arbitrated: arbitrable }),
    binding: testBinding({ chainId, disputeId, arbitrated: arbitrable }),
  };
}

export function testCourt(overrides: Partial<Court> = {}): Court {
  return { id: 0n, parent: 0n, hiddenVotes: false, timesPerPeriod: [86_400n, 0n, 86_400n, 86_400n], policyUri: null, name: "General Court", ...overrides };
}

/** An IDisputeResolver v2 arbitrable: local-ID evidence, crowdfunded appeals and v2 withdrawals. */
export function testFamily(overrides: Partial<FamilyDetection> = {}): FamilyDetection {
  return {
    chainId: 1,
    arbitrable: TEST_ARBITRABLE,
    family: "idr-v2",
    writeFamily: "idr-v2",
    capabilities: {
      localId: "externalIDtoLocalID",
      evidence: { kind: "local-id" },
      appeal: { kind: "idr", fundAppeal: "fundAppeal(uint256,uint256)" },
      withdraw: { kind: "idr-v2" },
    },
    realityProxy: null,
    implementation: null,
    ...overrides,
  };
}

/** An accepted meta-evidence result as `loadMetaEvidence` returns it. */
export function testOkMetaEvidence(overrides: Partial<MetaEvidence> = {}): Extract<MetaEvidenceResult, { status: "ok" }> {
  return {
    status: "ok",
    metaEvidence: testMetaEvidence(overrides),
    uri: TEST_META_EVIDENCE_URI,
    fileUrl: `https://cdn.kleros.link${TEST_META_EVIDENCE_URI}`,
    script: { ran: false, reason: "no-script" },
  };
}

/** The details of a found dispute with every read successful. */
export function testDetails(lookup: Extract<DisputeLookup, { status: "found" }>, overrides: Partial<DisputeReads> = {}): DisputeReads {
  return {
    dispute: lookup.dispute,
    binding: lookup.binding,
    votesLengths: { ok: true, value: [3n] },
    currentRuling: { ok: true, value: 1n },
    appealDecisions: { ok: true, value: [] },
    appealInfo: null,
    localId: { kind: "local-id", value: 7n },
    ...overrides,
  };
}
