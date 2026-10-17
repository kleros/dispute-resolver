import * as core from "@dispute-resolver/core";
import type { Address, EvidenceList, Outcome, DisputeEventResult } from "@dispute-resolver/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestDataProvider, createTestDeps, testCourt, testDetails, testFamily, testFoundLookup, testOkMetaEvidence } from "../test/data";
import type { CaseData, CaseDispute } from "./types";
import { useCase } from "./useCase";
import { useCaseRefresh } from "./useCaseRefresh";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const ACCOUNT: Address = "0x1111111111111111111111111111111111111111";
const EVIDENCE: EvidenceList = { items: [], hiddenEvidenceCount: 0, hiddenByReason: { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 } };
const FOUND_EVENT: Outcome<DisputeEventResult> = {
  ok: true,
  value: { status: "found", event: { metaEvidenceId: 0n, evidenceGroupId: 3n, blockNumber: 100n, createdAt: 1_700_000_000, transactionHash: "0x01" } },
};

function programReads(period: 3 | 4): void {
  vi.mocked(core.lookupDispute).mockResolvedValue(testFoundLookup({ period }));
  vi.mocked(core.detectFamily).mockResolvedValue(testFamily());
  vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence());
  vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_EVENT);
  vi.mocked(core.loadEvidence).mockResolvedValue({ ok: true, value: EVIDENCE });
  vi.mocked(core.listCourts).mockResolvedValue({ ok: true, value: [testCourt()] });
  vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
    Promise.resolve(
      testDetails(
        { status: "found", ...found },
        { appealInfo: { ok: true, value: { appealCost: 1_000n, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 } } },
      ),
    ),
  );
  vi.mocked(core.readMultipliers).mockResolvedValue({ ok: true, value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n } });
  vi.mocked(core.readRoundFunding).mockResolvedValue({ ok: true, value: { round: 0n, contributions: [], fundedRulings: [] } });
  vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "available", beneficiary: ACCOUNT, total: 5n, items: [{ dialect: "idr-v2", ruling: 1n, amount: 5n }] });
}

function renderCaseWithRefresh() {
  const deps = createTestDeps();
  const wrapper = ({ children }: { readonly children?: ReactNode }) => <TestDataProvider deps={deps}>{children}</TestDataProvider>;
  return renderHook(() => ({ data: useCase(1, 1n, ACCOUNT), refresh: useCaseRefresh(1, 1n) }), { wrapper });
}

function dispute(data: CaseData): CaseDispute {
  if (data.status !== "dispute") throw new Error("expected a dispute");
  return data;
}

async function settled(result: { readonly current: { readonly data: CaseData } }): Promise<void> {
  await waitFor(() => {
    expect(dispute(result.current.data).appealPanel.status).toBe("ready");
    expect(dispute(result.current.data).evidence.status).toBe("ready");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCaseRefresh (ARCHITECTURE.md §5.6)", () => {
  it("D-07: nothing is read again until a mined write asks for it, and evidence rereads the lookup and the evidence", async () => {
    programReads(3);
    const { result } = renderCaseWithRefresh();
    await settled(result);
    expect(core.loadEvidence).toHaveBeenCalledTimes(1);

    await act(() => result.current.refresh("evidence"));

    expect(core.lookupDispute).toHaveBeenCalledTimes(2);
    expect(core.loadEvidence).toHaveBeenCalledTimes(2);
    expect(core.readDisputeDetails).toHaveBeenCalledTimes(1);
    expect(core.readRoundFunding).toHaveBeenCalledTimes(1);
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
  });

  it("P-02: after a mined funding the panel shows the refreshed totals, current ruling and appeal cost included", async () => {
    programReads(3);
    const { result } = renderCaseWithRefresh();
    await settled(result);
    vi.mocked(core.readRoundFunding).mockResolvedValue({ ok: true, value: { round: 0n, contributions: [{ ruling: 1n, amount: 400n }], fundedRulings: [] } });

    await act(() => result.current.refresh("appeal"));

    expect(core.readDisputeDetails).toHaveBeenCalledTimes(2);
    expect(core.readRoundFunding).toHaveBeenCalledTimes(2);
    expect(core.loadEvidence).toHaveBeenCalledTimes(2);
    expect(core.readRoundFunding).toHaveBeenLastCalledWith(expect.anything(), 0n, 100n);
    await waitFor(() => {
      const panel = dispute(result.current.data).appealPanel;
      if (panel.status !== "ready" || panel.value.kind !== "crowdfunding") throw new Error("expected crowdfunding cards");
      expect(panel.value.cards.find((card) => card.code === 1n)?.contributed).toBe(400n);
    });
  });

  it("P-02: after the mined withdrawals the panel shows nothing withdrawable", async () => {
    programReads(4);
    const { result } = renderCaseWithRefresh();
    await settled(result);
    expect(dispute(result.current.data).appealPanel).toMatchObject({ status: "ready", value: { kind: "withdraw", state: { status: "available", total: 5n } } });
    vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "nothing" });

    await act(() => result.current.refresh("withdraw"));

    await waitFor(() => {
      expect(dispute(result.current.data).appealPanel).toEqual({ status: "ready", value: { kind: "withdraw", state: { status: "nothing" } } });
    });
    expect(core.lookupDispute).toHaveBeenCalledTimes(1);
  });
});
