import {
  getChain,
  type Address,
  type ArbitratedBinding,
  type ArbitratorDispute,
  type CanonicalIpfsPath,
  type ChainConfig,
  type Court,
  type DisputeEvent,
  type DisputeEventResult,
  type DisputeLookup,
  type DisputeReads,
  type EvidenceList,
  type FamilyDetection,
  type HiddenEvidenceReason,
  type MetaEvidence,
  type MetaEvidenceResult,
  type Period,
} from "@dispute-resolver/core";
import type { CaseData, CaseDispute, CaseWriteContext } from "../../data";
import { testMetaEvidence } from "../safe-content";
import type { RpcHandler } from "./createTestDeps";
import { sectionLoading } from "./TestDataProvider";

const TEST_ARBITRATOR: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
export const TEST_ARBITRABLE: Address = "0xc5e9ddebb09cd64dfacab4011a0d5cedaf7c9bdb";
export const TEST_META_EVIDENCE_URI: CanonicalIpfsPath = "/ipfs/QmQ2XoA25HmnPUEWDduxj6LYwMwp6jtXPFRMHcNF2EvJfU/metaEvidence.json";

/** Only core constructs `ArbitratedBinding`; a test casts one to stand in for a lookup it does not run. */
export function testBinding(overrides: Partial<Omit<ArbitratedBinding, symbol>> = {}): ArbitratedBinding {
  const binding = { chainId: 1, disputeId: 1n, arbitrator: TEST_ARBITRATOR, arbitrated: TEST_ARBITRABLE, ...overrides };
  return binding as unknown as ArbitratedBinding;
}

function testDispute(overrides: Partial<ArbitratorDispute> = {}): ArbitratorDispute {
  return { id: 1n, subcourtId: 0n, arbitrated: TEST_ARBITRABLE, numberOfChoices: 2n, period: 0, lastPeriodChange: 1_700_000_000, ruled: false, ...overrides };
}

export function testFoundLookup(
  options: { readonly chainId?: number; readonly disputeId?: bigint; readonly period?: Period; readonly arbitrable?: Address; readonly ruled?: boolean } = {},
): Extract<DisputeLookup, { status: "found" }> {
  const { chainId = 1, disputeId = 1n, period = 0, arbitrable = TEST_ARBITRABLE, ruled = false } = options;
  return {
    status: "found",
    dispute: testDispute({ id: disputeId, period, arbitrated: arbitrable, ruled }),
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
      appeal: { kind: "idr" },
      withdraw: { kind: "idr-v2" },
    },
    realityProxy: null,
    implementation: null,
    ...overrides,
  };
}

export function testOkMetaEvidence(overrides: Partial<MetaEvidence> = {}): Extract<MetaEvidenceResult, { status: "ok" }> {
  return {
    status: "ok",
    metaEvidence: testMetaEvidence(overrides),
    uri: TEST_META_EVIDENCE_URI,
    fileUrl: `https://cdn.kleros.link${TEST_META_EVIDENCE_URI}`,
    script: { ran: false, reason: "no-script" },
    source: { kind: "locator", event: "not-read" },
  };
}

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

/** The write context of `testFoundLookup()`'s dispute. Its appeal cost cannot be read again unless a test gives one. */
export function testWriteContext(overrides: Partial<CaseWriteContext> = {}): CaseWriteContext {
  return {
    binding: testFoundLookup().binding,
    family: testFamily(),
    localId: { kind: "local-id", value: 7n },
    readAppealCost: () => Promise.resolve({ ok: false, error: { code: "not-found", message: "This test reads no appeal cost." } }),
    ...overrides,
  };
}

export function testDisputeEvent(overrides: Partial<DisputeEvent> = {}): Extract<DisputeEventResult, { status: "found" }> {
  return { status: "found", event: { metaEvidenceId: 0n, evidenceGroupId: 3n, blockNumber: 100n, createdAt: 1_700_000_000, transactionHash: "0x01", ...overrides } };
}

export function testEvidenceList(items: EvidenceList["items"] = [], hidden: Partial<Record<HiddenEvidenceReason, number>> = {}): EvidenceList {
  const hiddenByReason = { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0, ...hidden };
  return { items, hiddenEvidenceCount: Object.values(hiddenByReason).reduce((sum, count) => sum + count, 0), hiddenByReason };
}

export function testCaseDispute(overrides: Partial<CaseDispute> = {}): CaseDispute {
  return {
    status: "dispute",
    chainId: 1,
    disputeId: 1n,
    lookup: sectionLoading,
    view: sectionLoading,
    family: sectionLoading,
    metaEvidence: sectionLoading,
    disputeEvent: sectionLoading,
    evidence: sectionLoading,
    appealDecisions: sectionLoading,
    courts: sectionLoading,
    appealPanel: sectionLoading,
    decision: sectionLoading,
    write: sectionLoading,
    ...overrides,
  };
}

export function testChain(id: number): ChainConfig {
  const chain = getChain(id);
  if (chain === undefined) throw new Error(`Chain ${String(id)} is not configured.`);
  return chain;
}

export function caseDispute(data: CaseData): CaseDispute {
  if (data.status !== "dispute") throw new Error("expected a dispute");
  return data;
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export function codeRpc(code: string): RpcHandler {
  return ({ method }) => {
    if (method === "eth_getCode") return code;
    throw new Error(`unexpected ${method}`);
  };
}
