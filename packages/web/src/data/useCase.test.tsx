import * as core from "@dispute-resolver/core";
import type { Address, DisputeEventResult, EvidenceList, FamilyDetection, MetaEvidenceResult, Outcome, Period } from "@dispute-resolver/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_ARBITRABLE, TestDataProvider, createTestDeps, createTestQueryClient, testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence } from "../test/data";
import { queryKeys } from "./queryKeys";
import type { CaseData, CaseDispute, CoreDeps } from "./types";
import { useCase } from "./useCase";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const ACCOUNT: Address = "0x1111111111111111111111111111111111111111";
const EVIDENCE: EvidenceList = {
  items: [],
  hiddenEvidenceCount: 0,
  hiddenByReason: { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 },
};
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
  vi.mocked(core.readMultipliers).mockResolvedValue({
    ok: true,
    value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n },
  });
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

describe("useCase", () => {
  it("reads nothing without a dispute ID", () => {
    const { result } = renderCase(null);
    expect(result.current).toEqual({ status: "no-id", chainId: 1 });
    expect(core.lookupDispute).not.toHaveBeenCalled();
  });

  it("brings every section of a found dispute to ready", async () => {
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.view).toMatchObject({ status: "ready", value: { exists: true, period: 0, numberOfVotes: { ok: true, value: 3 } } });
    expect(current.family).toEqual({ status: "ready", value: testFamily() });
    expect(current.evidence).toEqual({ status: "ready", value: EVIDENCE });
    expect(current.appealPanel).toEqual({ status: "ready", value: { kind: "hidden" } });
    expect(current.write.status).toBe("ready");
    expect(core.loadEvidence).toHaveBeenCalledWith(expect.objectContaining({ evidenceGroupId: 3n, arbitrable: testFoundLookup().binding.arbitrated }));
    expect(core.readDisputeDetails).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 1 }),
      expect.objectContaining({ binding: testFoundLookup().binding }),
      testFamily(),
      100n,
    );
  });

  it("takes the write context's binding from the arbitrator, whatever the meta-evidence says", async () => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence({ aliases: { "0x2222222222222222222222222222222222222222": "Attacker" } }));
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.write).toMatchObject({ status: "ready", value: { binding: testFoundLookup().binding, localId: { kind: "local-id", value: 7n } } });
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ arbitrable: testFoundLookup().binding.arbitrated, budgetMs: core.CASE_PAGE_BUDGET_MS }));
  });

  it("reaches ready on the case page when the Ongoing page already stored the meta-evidence", async () => {
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.metaEvidence(1, 1n, TEST_ARBITRABLE), testOkMetaEvidence({ title: "Stored" }));
    const { result } = renderCase(1n, { client });
    const current = await settledCase(result);
    expect(current.metaEvidence).toEqual({ status: "ready", value: testOkMetaEvidence() });
    expect(current.view).toMatchObject({ status: "ready", value: { exists: true } });
    expect(current.appealPanel.status).toBe("ready");
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
  });

  it("shows the not-found state for a nonexistent ID and reads nothing else", async () => {
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

  it("shows nothing of the previous dispute while a new ID's lookup runs", async () => {
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

  it("degrades only the appeal panel and the write context when family detection fails", async () => {
    vi.mocked(core.detectFamily).mockRejectedValue(new Error("eth_getCode failed"));
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.family).toEqual({ status: "unavailable", error: { code: "rpc-error", message: "The request failed." } });
    expect(core.detectFamily).toHaveBeenCalledTimes(2);
    expect(core.readDisputeDetails).toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined, 100n);
    expect(current.view).toMatchObject({ status: "ready", value: { exists: true, family: { ok: false } } });
    expect(current.appealPanel).toMatchObject({ status: "unavailable", error: { message: "The request failed." } });
    expect(current.write.status).toBe("unavailable");
    expect(current.evidence.status).toBe("ready");
  });

  it("explains the missing Dispute event in the evidence section and reads the details without its block", async () => {
    vi.mocked(core.readDisputeEvent).mockResolvedValue({ ok: true, value: { status: "not-found" } });
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.evidence).toMatchObject({ status: "unavailable", error: { code: "not-found" } });
    expect(core.loadEvidence).not.toHaveBeenCalled();
    expect(core.readDisputeDetails).toHaveBeenCalledWith(expect.anything(), expect.anything(), testFamily(), null);
    expect(current.view.status).toBe("ready");
  });

  it("degrades the evidence section with the reason of a failed Dispute-event scan", async () => {
    const error = { code: "rpc-error", message: "getLogs refused" } as const;
    vi.mocked(core.readDisputeEvent).mockResolvedValue({ ok: false, error });
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.disputeEvent).toEqual({ status: "unavailable", error });
    expect(current.evidence).toEqual({ status: "unavailable", error });
    expect(core.loadEvidence).not.toHaveBeenCalled();
    expect(current.view.status).toBe("ready");
  });

  it("degrades the appeal cards, not the rest of the page, when the meta-evidence fails to load", async () => {
    programReads(3);
    const failed: MetaEvidenceResult = { status: "failed", reason: "not-json", error: { code: "invalid-data", message: "The meta-evidence is not JSON." } };
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(failed);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.metaEvidence).toEqual({ status: "ready", value: failed });
    expect(current.appealPanel).toEqual({ status: "unavailable", error: failed.error });
    expect(current.view).toMatchObject({ status: "ready", value: { exists: true } });
    expect(current.evidence.status).toBe("ready");
  });

  it("scans the current round's funding from the round's start block in the appeal period", async () => {
    programReads(3);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(core.readRoundFunding).toHaveBeenCalledWith(expect.objectContaining({ localId: { kind: "local-id", value: 7n } }), 1n, 500n);
    expect(core.readMultipliers).toHaveBeenCalledTimes(1);
    expect(core.readWithdrawable).not.toHaveBeenCalled();
    expect(current.appealPanel).toMatchObject({ status: "ready", value: { kind: "crowdfunding" } });
    expect(current.write).toMatchObject({ status: "ready", value: { appealInfo: { appealCost: 1_000n } } });
  });

  it("the write context re-reads the appeal cost from the arbitrator on the page chain's read client", async () => {
    programReads(3);
    vi.mocked(core.detectFamily).mockResolvedValue(escrowFamily);
    vi.mocked(core.readAppealCost).mockResolvedValue({ ok: true, value: 2_000n });
    const deps = createTestDeps();
    const { result } = renderCase(1n, { deps });
    const current = await settledCase(result);
    if (current.write.status !== "ready") throw new Error("The write context is not ready.");
    expect(core.readAppealCost).not.toHaveBeenCalled();

    await expect(current.write.value.readAppealCost()).resolves.toEqual({ ok: true, value: 2_000n });
    expect(core.readAppealCost).toHaveBeenCalledTimes(1);
    const [context, binding] = vi.mocked(core.readAppealCost).mock.calls[0] ?? [];
    expect(context?.client).toBe(deps.getReadClient(1));
    expect(binding).toEqual(testFoundLookup().binding);
  });

  it("never scans an arbitrable that does not crowdfund for funding", async () => {
    programReads(3);
    vi.mocked(core.detectFamily).mockResolvedValue(escrowFamily);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(core.readRoundFunding).not.toHaveBeenCalled();
    expect(core.readMultipliers).not.toHaveBeenCalled();
    expect(current.appealPanel).toMatchObject({ status: "ready", value: { kind: "escrow-appeal" } });
  });

  it("reads the connected account's withdrawable amount over every round in execution", async () => {
    programReads(4);
    const { result } = renderCase(1n, { account: ACCOUNT });
    const current = await settledCase(result);
    expect(core.readWithdrawable).toHaveBeenCalledWith(expect.objectContaining({ binding: testFoundLookup().binding }), {
      beneficiary: ACCOUNT,
      rounds: [0n, 1n],
      roundStartBlocks: [100n, 500n],
    });
    expect(core.readMultipliers).not.toHaveBeenCalled();
    expect(current.appealPanel).toEqual({ status: "ready", value: { kind: "withdraw", state: { status: "nothing" } } });
  });

  it("funds the session of a governor dispute's Dispute event in the appeal period", async () => {
    programReads(3);
    vi.mocked(core.detectFamily).mockResolvedValue(governorFamily);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(core.readRoundFunding).toHaveBeenCalledWith(expect.objectContaining({ family: governorFamily, evidenceGroupId: 3n }), 1n, 500n);
    expect(current.appealPanel).toMatchObject({ status: "ready", value: { kind: "crowdfunding" } });
  });

  it("reads the withdrawable amount of a governor dispute's Dispute-event session in execution", async () => {
    programReads(4);
    vi.mocked(core.detectFamily).mockResolvedValue(governorFamily);
    const { result } = renderCase(1n, { account: ACCOUNT });
    const current = await settledCase(result);
    expect(core.readWithdrawable).toHaveBeenCalledWith(expect.objectContaining({ family: governorFamily, evidenceGroupId: 3n }), {
      beneficiary: ACCOUNT,
      rounds: [0n, 1n],
      roundStartBlocks: [100n, 500n],
    });
    expect(current.appealPanel).toEqual({ status: "ready", value: { kind: "withdraw", state: { status: "nothing" } } });
  });

  it("reads a governor's withdrawable amount again for the session of a Dispute event that recovers", async () => {
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

  it("reads a governor's round funding again for the session of a Dispute event that recovers", async () => {
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

  it("degrades the funding-dependent sections instead of guessing a round when the appeal decisions fail", async () => {
    programReads(4);
    vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
      Promise.resolve(testDetails({ status: "found", ...found }, { appealDecisions: { ok: false, error: { code: "rpc-error", message: "logs refused" } } })),
    );
    const { result } = renderCase(1n, { account: ACCOUNT });
    const current = await settledCase(result);
    expect(core.readRoundFunding).not.toHaveBeenCalled();
    expect(core.readWithdrawable).not.toHaveBeenCalled();
    expect(current.view).toMatchObject({ status: "ready", value: { decision: { ok: false, error: { message: "logs refused" } } } });
    expect(current.appealDecisions).toMatchObject({ status: "unavailable", error: { code: "rpc-error", message: "logs refused" } });
  });

  it("passes the AppealDecision events of the details to the evidence section", async () => {
    programReads(4);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(current.appealDecisions).toEqual({ status: "ready", value: [{ blockNumber: 500n, appealedAt: 1_700_000_100 }] });
  });

  it("degrades an unconfigured chain to no-rpc without a read", async () => {
    vi.mocked(core.lookupDispute).mockResolvedValue({ status: "unavailable", error: { code: "no-rpc", message: "No RPC is configured for chain 1." } });
    const { result } = renderCase(1n, { deps: createTestDeps({ unconfiguredChains: [1] }) });
    await waitFor(() => {
      expect(dispute(result.current).view).toMatchObject({ status: "ready", value: { exists: false, reason: "unavailable" } });
    });
    expect(vi.mocked(core.lookupDispute).mock.calls[0]?.[0].client).toBeUndefined();
    expect(dispute(result.current).family).toMatchObject({ status: "unavailable", error: { code: "no-rpc" } });
  });
});
