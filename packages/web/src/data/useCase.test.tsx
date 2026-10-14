import * as core from "@dispute-resolver/core";
import type { Address, DisputeEventResult, EvidenceList, FamilyDetection, MetaEvidenceResult, Outcome, Period } from "@dispute-resolver/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestDataProvider, createTestDeps, createTestQueryClient, testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence } from "../test/data";
import { queryKeys } from "./queryKeys";
import type { CaseData, CaseDispute, CoreDeps } from "./types";
import { useCase } from "./useCase";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const ACCOUNT: Address = "0x1111111111111111111111111111111111111111";
const EVIDENCE: EvidenceList = { items: [], hiddenEvidenceCount: 0, hiddenByReason: { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 } };
const FOUND_EVENT: Outcome<DisputeEventResult> = {
  ok: true,
  value: { status: "found", event: { metaEvidenceId: 0n, evidenceGroupId: 3n, blockNumber: 100n, createdAt: 1_700_000_000, transactionHash: "0x01" } },
};

const UNKNOWN_SESSION = { code: "not-found", message: "The governor session is unknown: the dispute's Dispute event was not read." } as const;

const escrowFamily: FamilyDetection = testFamily({
  family: "escrow-v1",
  writeFamily: "escrow-v1",
  capabilities: { localId: "disputeIDtoTransactionID", evidence: { kind: "local-id" }, appeal: { kind: "escrow-pay-cost" }, withdraw: { kind: "none" } },
});

const governorFamily: FamilyDetection = testFamily({
  family: "governor",
  writeFamily: "governor",
  capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
});

/** Programs every read of dispute 1 on chain 1 in `period` to succeed. */
function programReads(period: Period = 0): void {
  const lookup = testFoundLookup({ period });
  vi.mocked(core.lookupDispute).mockResolvedValue(lookup);
  vi.mocked(core.detectFamily).mockResolvedValue(testFamily());
  vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence());
  vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_EVENT);
  vi.mocked(core.loadEvidence).mockResolvedValue({ ok: true, value: EVIDENCE });
  vi.mocked(core.listCourts).mockResolvedValue({ ok: true, value: [testCourt()] });
  vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
    Promise.resolve(
      testDetails(
        { status: "found", ...found },
        {
          appealDecisions: { ok: true, value: period >= 3 ? [{ blockNumber: 500n, appealedAt: 1_700_000_100 }] : [] },
          appealInfo: period >= 3 ? { ok: true, value: { appealCost: 1_000n, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 } } : null,
        },
      ),
    ),
  );
  vi.mocked(core.readMultipliers).mockResolvedValue({ ok: true, value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n } });
  vi.mocked(core.readRoundFunding).mockImplementation((_context, round) => Promise.resolve({ ok: true, value: { round, contributions: [], fundedRulings: [] } }));
  vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "nothing" });
}

function renderCase(disputeId: bigint | null, options: { readonly deps?: CoreDeps; readonly account?: Address; readonly client?: QueryClient } = {}) {
  const deps = options.deps ?? createTestDeps();
  const wrapper = ({ children }: { readonly children?: ReactNode }) => (
    <TestDataProvider deps={deps} client={options.client}>
      {children}
    </TestDataProvider>
  );
  return renderHook(({ id }: { id: bigint | null }) => useCase(1, id, options.account), { wrapper, initialProps: { id: disputeId } });
}

function dispute(data: CaseData): CaseDispute {
  if (data.status !== "dispute") throw new Error("expected a dispute");
  return data;
}

async function settledCase(result: { readonly current: CaseData }): Promise<CaseDispute> {
  await waitFor(() => {
    const current = dispute(result.current);
    expect(current.view.status).not.toBe("loading");
    expect(current.appealPanel.status).not.toBe("loading");
    expect(current.evidence.status).not.toBe("loading");
  });
  return dispute(result.current);
}

beforeEach(() => {
  vi.clearAllMocks();
  programReads();
});

describe("useCase (ARCHITECTURE.md §5.3)", () => {
  it("D-09: no dispute ID makes no read", () => {
    const { result } = renderCase(null);
    expect(result.current).toEqual({ status: "no-id", chainId: 1 });
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("D-36: every section of a found dispute becomes ready", async () => {
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.view).toMatchObject({ status: "ready", value: { exists: true, period: 0, numberOfVotes: { ok: true, value: 3 } } });
    expect(current.family).toEqual({ status: "ready", value: testFamily() });
    expect(current.evidence).toEqual({ status: "ready", value: EVIDENCE });
    expect(current.appealPanel).toEqual({ status: "ready", value: { kind: "hidden" } });
    expect(current.write.status).toBe("ready");
    expect(core.loadEvidence).toHaveBeenCalledWith(expect.objectContaining({ evidenceGroupId: 3n, arbitrable: testFoundLookup().binding.arbitrated }));
    expect(core.readDisputeDetails).toHaveBeenCalledWith(expect.objectContaining({ chainId: 1 }), expect.objectContaining({ binding: testFoundLookup().binding }), testFamily(), 100n);
  });

  it("A22: the write context's binding is the arbitrator's, whatever the meta-evidence says", async () => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence({ aliases: { "0x2222222222222222222222222222222222222222": "Attacker" } }));
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.write).toMatchObject({ status: "ready", value: { binding: testFoundLookup().binding, localId: { kind: "local-id", value: 7n } } });
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ arbitrable: testFoundLookup().binding.arbitrated, budgetMs: core.CASE_PAGE_BUDGET_MS }));
  });

  it("D-53: a nonexistent ID shows the not-found state and reads nothing else", async () => {
    vi.mocked(core.lookupDispute).mockResolvedValue({ status: "not-found" });
    const { result } = renderCase(99n);
    await waitFor(() => {
      expect(dispute(result.current).view).toEqual({ status: "ready", value: { exists: false, reason: "not-found" } });
    });
    const current = dispute(result.current);
    expect(current.family).toMatchObject({ status: "unavailable", error: { code: "not-found" } });
    expect(current.appealPanel.status).toBe("unavailable");
    expect(core.detectFamily).not.toHaveBeenCalled();
    expect(core.loadMetaEvidence).not.toHaveBeenCalled();
  });

  it("D-53: a new ID shows nothing of the previous dispute while its lookup runs", async () => {
    const { result, rerender } = renderCase(1n);
    await settledCase(result);
    vi.mocked(core.lookupDispute).mockReturnValue(new Promise(() => undefined));
    rerender({ id: 2n });
    const current = dispute(result.current);
    expect(current.disputeId).toBe(2n);
    for (const section of [current.lookup, current.view, current.family, current.metaEvidence, current.evidence, current.appealPanel, current.write]) {
      expect(section).toEqual({ status: "loading" });
    }
  });

  it("D-36: a failed family detection degrades the appeal panel and the write context only", async () => {
    vi.mocked(core.detectFamily).mockRejectedValue(new Error("eth_getCode failed"));
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.family).toEqual({ status: "unavailable", error: { code: "rpc-error", message: "eth_getCode failed" } });
    expect(core.detectFamily).toHaveBeenCalledTimes(2);
    expect(core.readDisputeDetails).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined, 100n);
    expect(current.view).toMatchObject({ status: "ready", value: { exists: true, family: { ok: false } } });
    expect(current.appealPanel).toMatchObject({ status: "unavailable", error: { message: "eth_getCode failed" } });
    expect(current.write.status).toBe("unavailable");
    expect(current.evidence.status).toBe("ready");
  });

  it("D-36: without a Dispute event the evidence section says why, and details read without its block", async () => {
    vi.mocked(core.readDisputeEvent).mockResolvedValue({ ok: true, value: { status: "not-found" } });
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.evidence).toMatchObject({ status: "unavailable", error: { code: "not-found" } });
    expect(core.loadEvidence).not.toHaveBeenCalled();
    expect(core.readDisputeDetails).toHaveBeenCalledWith(expect.anything(), expect.anything(), testFamily(), null);
    expect(current.view.status).toBe("ready");
  });

  it("D-36: a failed Dispute-event scan degrades the evidence section with its reason", async () => {
    const error = { code: "rpc-error", message: "getLogs refused" } as const;
    vi.mocked(core.readDisputeEvent).mockResolvedValue({ ok: false, error });
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.disputeEvent).toEqual({ status: "unavailable", error });
    expect(current.evidence).toEqual({ status: "unavailable", error });
    expect(core.loadEvidence).not.toHaveBeenCalled();
    expect(current.view.status).toBe("ready");
  });

  it("B12: a meta-evidence that failed to load degrades the appeal panel, not the rest of the page", async () => {
    const failed: MetaEvidenceResult = { status: "failed", reason: "not-json", error: { code: "invalid-data", message: "The meta-evidence is not JSON." } };
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(failed);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.metaEvidence).toEqual({ status: "ready", value: failed });
    expect(current.appealPanel).toEqual({ status: "unavailable", error: failed.error });
    expect(current.view).toMatchObject({ status: "ready", value: { exists: true } });
    expect(current.evidence.status).toBe("ready");
  });

  it("D-02: in the appeal period the current round's funding is scanned from the round's start block", async () => {
    programReads(3);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(core.readRoundFunding).toHaveBeenCalledWith(expect.objectContaining({ localId: { kind: "local-id", value: 7n } }), 1n, 500n);
    expect(core.readMultipliers).toHaveBeenCalledTimes(1);
    expect(core.readWithdrawable).not.toHaveBeenCalled();
    expect(current.appealPanel).toMatchObject({ status: "ready", value: { kind: "crowdfunding" } });
    expect(current.write).toMatchObject({ status: "ready", value: { appealInfo: { appealCost: 1_000n } } });
  });

  it("06 §1: an arbitrable that does not crowdfund is never scanned for funding", async () => {
    programReads(3);
    vi.mocked(core.detectFamily).mockResolvedValue(escrowFamily);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(core.readRoundFunding).not.toHaveBeenCalled();
    expect(core.readMultipliers).not.toHaveBeenCalled();
    expect(current.appealPanel).toMatchObject({ status: "ready", value: { kind: "escrow-appeal" } });
  });

  it("D-51: in execution the connected account's withdrawable amount is read over every round", async () => {
    programReads(4);
    const { result } = renderCase(1n, { account: ACCOUNT });
    const current = await settledCase(result);
    expect(core.readWithdrawable).toHaveBeenCalledWith(expect.objectContaining({ binding: testFoundLookup().binding }), { beneficiary: ACCOUNT, rounds: [0n, 1n], roundStartBlocks: [100n, 500n] });
    expect(core.readMultipliers).not.toHaveBeenCalled();
    expect(current.appealPanel).toEqual({ status: "ready", value: { kind: "withdraw", state: { status: "nothing" } } });
  });

  it("WN-1 / D-47: a governor dispute in the appeal period funds the session of its Dispute event", async () => {
    programReads(3);
    vi.mocked(core.detectFamily).mockResolvedValue(governorFamily);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(core.readRoundFunding).toHaveBeenCalledWith(expect.objectContaining({ family: governorFamily, evidenceGroupId: 3n }), 1n, 500n);
    expect(current.appealPanel).toMatchObject({ status: "ready", value: { kind: "crowdfunding" } });
  });

  it("WN-1 / D-47: a governor dispute in execution reads the withdrawable amount of its Dispute event's session", async () => {
    programReads(4);
    vi.mocked(core.detectFamily).mockResolvedValue(governorFamily);
    const { result } = renderCase(1n, { account: ACCOUNT });
    const current = await settledCase(result);
    expect(core.readWithdrawable).toHaveBeenCalledWith(expect.objectContaining({ family: governorFamily, evidenceGroupId: 3n }), { beneficiary: ACCOUNT, rounds: [0n, 1n], roundStartBlocks: [100n, 500n] });
    expect(current.appealPanel).toEqual({ status: "ready", value: { kind: "withdraw", state: { status: "nothing" } } });
  });

  it("R4 / D-47: a governor's withdrawable amount is read again for the session of a Dispute event that recovers", async () => {
    programReads(4);
    vi.mocked(core.detectFamily).mockResolvedValue(governorFamily);
    vi.mocked(core.readDisputeEvent).mockResolvedValue({ ok: false, error: { code: "rpc-error", message: "getLogs refused" } });
    vi.mocked(core.readWithdrawable).mockImplementation((context) =>
      Promise.resolve(context.evidenceGroupId === undefined ? { status: "unavailable", error: UNKNOWN_SESSION } : { status: "nothing" }),
    );
    const client = createTestQueryClient();
    const { result } = renderCase(1n, { account: ACCOUNT, client });
    const failed = await settledCase(result);
    expect(failed.appealPanel).toEqual({ status: "ready", value: { kind: "withdraw", state: { status: "unavailable", error: UNKNOWN_SESSION } } });

    vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_EVENT);
    await act(() => client.invalidateQueries({ queryKey: queryKeys.disputeEvent(1, 1n, testFoundLookup().binding.arbitrated) }));
    await waitFor(() => {
      expect(dispute(result.current).appealPanel).toEqual({ status: "ready", value: { kind: "withdraw", state: { status: "nothing" } } });
    });
    expect(core.readWithdrawable).toHaveBeenLastCalledWith(expect.objectContaining({ family: governorFamily, evidenceGroupId: 3n }), {
      beneficiary: ACCOUNT,
      rounds: [0n, 1n],
      roundStartBlocks: [100n, 500n],
    });
  });

  it("R4 / D-47: a governor's round funding is read again for the session of a Dispute event that recovers", async () => {
    programReads(3);
    vi.mocked(core.detectFamily).mockResolvedValue(governorFamily);
    vi.mocked(core.readDisputeEvent).mockResolvedValue({ ok: false, error: { code: "rpc-error", message: "getLogs refused" } });
    vi.mocked(core.readRoundFunding).mockImplementation((context, round) =>
      Promise.resolve(context.evidenceGroupId === undefined ? { ok: false, error: UNKNOWN_SESSION } : { ok: true, value: { round, contributions: [], fundedRulings: [] } }),
    );
    const client = createTestQueryClient();
    const { result } = renderCase(1n, { client });
    const failed = await settledCase(result);
    expect(failed.appealPanel).toEqual({ status: "ready", value: { kind: "fees-unavailable", error: UNKNOWN_SESSION } });

    vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_EVENT);
    await act(() => client.invalidateQueries({ queryKey: queryKeys.disputeEvent(1, 1n, testFoundLookup().binding.arbitrated) }));
    await waitFor(() => {
      expect(dispute(result.current).appealPanel).toMatchObject({ status: "ready", value: { kind: "crowdfunding" } });
    });
    expect(core.readRoundFunding).toHaveBeenLastCalledWith(expect.objectContaining({ family: governorFamily, evidenceGroupId: 3n }), 1n, 500n);
  });

  it("D-36: failed appeal decisions degrade the funding-dependent sections instead of guessing a round", async () => {
    programReads(4);
    vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
      Promise.resolve(testDetails({ status: "found", ...found }, { appealDecisions: { ok: false, error: { code: "rpc-error", message: "logs refused" } } })),
    );
    const { result } = renderCase(1n, { account: ACCOUNT });
    const current = await settledCase(result);
    expect(core.readRoundFunding).not.toHaveBeenCalled();
    expect(core.readWithdrawable).not.toHaveBeenCalled();
    expect(current.view).toMatchObject({ status: "ready", value: { decision: { ok: false, error: { message: "logs refused" } } } });
  });

  it("D-56: an unconfigured chain degrades to no-rpc without a read", async () => {
    vi.mocked(core.lookupDispute).mockResolvedValue({ status: "unavailable", error: { code: "no-rpc", message: "No RPC is configured for chain 1." } });
    const { result } = renderCase(1n, { deps: createTestDeps({ unconfiguredChains: [1] }) });
    await waitFor(() => {
      expect(dispute(result.current).view).toMatchObject({ status: "ready", value: { exists: false, reason: "unavailable" } });
    });
    expect(vi.mocked(core.lookupDispute).mock.calls[0]?.[0].client).toBeUndefined();
    expect(dispute(result.current).family).toMatchObject({ status: "unavailable", error: { code: "no-rpc" } });
  });
});
