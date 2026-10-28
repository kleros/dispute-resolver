import * as core from "@dispute-resolver/core";
import type { Address, DisputeEventResult, FamilyDetection, MetaEvidenceResult, Outcome, Period } from "@dispute-resolver/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  caseDispute,
  createTestDeps,
  createTestQueryClient,
  dataWrapper,
  testCourt,
  testDetails,
  testDisputeEvent,
  testEvidenceList,
  testFamily,
  testFoundLookup,
  testOkMetaEvidence,
} from "../test/data";
import { disputeKeyPrefix, queryKeys } from "./queryKeys";
import type { CaseData, CaseDispute, CoreDeps } from "./types";
import { useCase } from "./useCase";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const ACCOUNT: Address = "0x1111111111111111111111111111111111111111";
const EVIDENCE = testEvidenceList();
const FOUND_EVENT: Outcome<DisputeEventResult> = { ok: true, value: testDisputeEvent() };

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

/** Programs every read of dispute 1 on chain 1 in `period` to succeed; `ruled` says whether the arbitrator executed the ruling. */
function programReads(period: Period = 0, ruled = false): void {
  const lookup = testFoundLookup({ period, ruled });
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
  vi.mocked(core.readExecutedRuling).mockResolvedValue({ status: "executed", ruling: 2n });
}

function renderCase(disputeId: bigint | null, options: { readonly deps?: CoreDeps; readonly account?: Address; readonly client?: QueryClient } = {}) {
  const wrapper = dataWrapper({ deps: options.deps ?? createTestDeps(), client: options.client });
  return renderHook(({ id }: { id: bigint | null }) => useCase(1, id, options.account), { wrapper, initialProps: { id: disputeId } });
}

async function settledCase(result: { readonly current: CaseData }): Promise<CaseDispute> {
  await waitFor(() => {
    const current = caseDispute(result.current);
    expect(current.view.status).not.toBe("loading");
    expect(current.decision.status).not.toBe("loading");
    expect(current.appealPanel.status).not.toBe("loading");
    expect(current.evidence.status).not.toBe("loading");
  });
  return caseDispute(result.current);
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
    expect(current.decision).toEqual({ status: "ready", value: { kind: "none" } });
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

  it("shows the not-found state for a nonexistent ID and reads nothing else", async () => {
    vi.mocked(core.lookupDispute).mockResolvedValue({ status: "not-found" });
    const { result } = renderCase(99n);
    await waitFor(() => {
      expect(caseDispute(result.current).view).toEqual({ status: "ready", value: { exists: false, reason: "not-found" } });
    });
    const current = caseDispute(result.current);
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
    const current = caseDispute(result.current);
    expect(current.disputeId).toBe(2n);
    for (const section of [current.lookup, current.view, current.family, current.metaEvidence, current.evidence, current.appealPanel, current.decision, current.write]) {
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
    expect(current.write.status).toBe("ready");
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
      expect(caseDispute(result.current).appealPanel).toEqual({ status: "ready", value: { kind: "withdraw", state: { status: "nothing" } } });
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
      expect(caseDispute(result.current).appealPanel).toMatchObject({ status: "ready", value: { kind: "crowdfunding" } });
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
    expect(current.appealPanel).toMatchObject({ status: "ready", value: { kind: "withdraw", state: { status: "unavailable", error: { message: "logs refused" } } } });
    expect(current.decision).toMatchObject({ status: "ready", value: { kind: "jury-ruling", execution: "pending" } });
    expect(current.appealDecisions).toMatchObject({ status: "unavailable", error: { code: "rpc-error", message: "logs refused" } });
  });

  it("the executed ruling is read only in execution once the arbitrator executed it, from the last round's start", async () => {
    programReads(4, true);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(core.readExecutedRuling).toHaveBeenCalledTimes(1);
    const [context, input] = vi.mocked(core.readExecutedRuling).mock.calls[0] ?? [];
    expect(context).toMatchObject({ chainId: 1 });
    expect(input).toEqual({ binding: testFoundLookup().binding, dispute: testFoundLookup({ period: 4, ruled: true }).dispute, fromBlock: 500n });
    expect(current.decision).toMatchObject({ status: "ready", value: { kind: "winner", winner: { ruling: 2n }, execution: "executed" } });
  });

  it("scans for the executed ruling from the dispute's start when the appeal decisions failed", async () => {
    programReads(4, true);
    vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
      Promise.resolve(testDetails({ status: "found", ...found }, { appealDecisions: { ok: false, error: { code: "rpc-error", message: "logs refused" } } })),
    );
    const { result } = renderCase(1n);
    await settledCase(result);
    expect(vi.mocked(core.readExecutedRuling).mock.calls[0]?.[1]).toMatchObject({ fromBlock: 100n });
  });

  it.each([
    ["in the appeal period", 3, true],
    ["in execution before the arbitrator executed the ruling", 4, false],
  ] as const)("reads no executed ruling %s", async (_case, period, ruled) => {
    programReads(period, ruled);
    const { result } = renderCase(1n);
    const current = await settledCase(result);
    expect(core.readExecutedRuling).not.toHaveBeenCalled();
    expect(current.decision.status).toBe("ready");
  });

  it("the decision is read again on the appeal refresh, and the executed ruling with it", async () => {
    programReads(4, true);
    const client = createTestQueryClient();
    const { result } = renderCase(1n, { client });
    await settledCase(result);
    vi.mocked(core.readExecutedRuling).mockResolvedValue({ status: "executed", ruling: 1n });
    await act(() => client.invalidateQueries({ queryKey: disputeKeyPrefix("executedRuling", 1, 1n) }));
    await waitFor(() => {
      expect(caseDispute(result.current).decision).toMatchObject({ status: "ready", value: { kind: "winner", wonBy: "reported", winner: { ruling: 1n } } });
    });
  });

  it.each([
    ["an executed ruling, which a later report can still contradict", { status: "executed", ruling: 2n }, 2],
    ["reports that disagree, which no later report can resolve", { status: "inconsistent" }, 1],
  ] as const)("reads the arbitrable's report again ten minutes later only for %s", async (_case, report, reads) => {
    programReads(4, true);
    vi.mocked(core.readExecutedRuling).mockResolvedValue(report);
    const client = createTestQueryClient();
    const first = renderCase(1n, { client });
    await settledCase(first.result);
    first.unmount();
    const later = Date.now() + 11 * 60_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(later);
    try {
      const second = renderCase(1n, { client });
      await settledCase(second.result);
      await waitFor(() => {
        expect(core.readExecutedRuling).toHaveBeenCalledTimes(reads);
      });
    } finally {
      clock.mockRestore();
    }
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
      expect(caseDispute(result.current).view).toMatchObject({ status: "ready", value: { exists: false, reason: "unavailable" } });
    });
    expect(vi.mocked(core.lookupDispute).mock.calls[0]?.[0].client).toBeUndefined();
    expect(caseDispute(result.current).family).toMatchObject({ status: "unavailable", error: { code: "no-rpc" } });
  });
});
