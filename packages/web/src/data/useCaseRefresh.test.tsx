import * as core from "@dispute-resolver/core";
import type { Address, Outcome, DisputeEventResult } from "@dispute-resolver/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { numberToHex } from "viem";
import {
  caseDispute,
  createTestDeps,
  dataWrapper,
  testCourt,
  testDetails,
  testDisputeEvent,
  testEvidenceList,
  testFamily,
  testFoundLookup,
  testOkMetaEvidence,
  type RpcHandler,
} from "../test/data";
import { useChainClockOffset } from "./chainTime";
import type { CaseData } from "./types";
import { useCase } from "./useCase";
import { useCaseRefresh } from "./useCaseRefresh";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const ACCOUNT: Address = "0x1111111111111111111111111111111111111111";
const EVIDENCE = testEvidenceList();
const FOUND_EVENT: Outcome<DisputeEventResult> = { ok: true, value: testDisputeEvent() };

function programReads(period: 3 | 4): void {
  vi.mocked(core.lookupDispute).mockResolvedValue(testFoundLookup({ period }));
  vi.mocked(core.detectFamily).mockResolvedValue(testFamily());
  vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence());
  vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_EVENT);
  vi.mocked(core.loadEvidence).mockResolvedValue({ ok: true, value: EVIDENCE });
  vi.mocked(core.listCourts).mockResolvedValue({ ok: true, value: [testCourt()] });
  vi.mocked(core.readDisputeDetails).mockImplementation((_context, found) =>
    Promise.resolve(
      testDetails({ status: "found", ...found }, { appealInfo: { ok: true, value: { appealCost: 1_000n, appealPeriodStart: 1_700_000_000, appealPeriodEnd: 4_000_000_000 } } }),
    ),
  );
  vi.mocked(core.readMultipliers).mockResolvedValue({
    ok: true,
    value: { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n },
  });
  vi.mocked(core.readRoundFunding).mockResolvedValue({ ok: true, value: { round: 0n, contributions: [], fundedRulings: [] } });
  vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "available", beneficiary: ACCOUNT, total: 5n, items: [{ dialect: "idr-v2", ruling: 1n, amount: 5n }] });
}

/** The only RPC request left once core's reads are mocked: the latest block, for the chain clock. */
const latestBlock = vi.fn<RpcHandler>(({ method }) => {
  if (method !== "eth_getBlockByNumber") throw new Error(`unexpected ${method}`);
  return { number: "0x10", timestamp: numberToHex(1_700_000_000), hash: `0x${"cd".repeat(32)}`, transactions: [] };
});

function renderCaseWithRefresh() {
  const deps = createTestDeps({ rpc: latestBlock });
  return renderHook(() => ({ data: useCase(1, 1n, ACCOUNT), refresh: useCaseRefresh(1, 1n), clockOffset: useChainClockOffset(1) }), { wrapper: dataWrapper({ deps }) });
}

async function settled(result: { readonly current: { readonly data: CaseData } }): Promise<void> {
  await waitFor(() => {
    expect(caseDispute(result.current.data).appealPanel.status).toBe("ready");
    expect(caseDispute(result.current.data).evidence.status).toBe("ready");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCaseRefresh", () => {
  it("reads nothing again until a mined write asks, and an evidence refresh rereads only the lookup and the evidence", async () => {
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

  it("shows the refreshed totals, current ruling and appeal cost included, after a mined funding", async () => {
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
      const panel = caseDispute(result.current.data).appealPanel;
      if (panel.status !== "ready" || panel.value.kind !== "crowdfunding") throw new Error("expected crowdfunding cards");
      expect(panel.value.cards.find((card) => card.code === 1n)?.contributed).toBe(400n);
    });
  });

  it("a refresh after a mined funding reads the chain time again with the details", async () => {
    programReads(3);
    const { result } = renderCaseWithRefresh();
    await settled(result);
    await waitFor(() => {
      expect(latestBlock).toHaveBeenCalledTimes(1);
    });

    await act(() => result.current.refresh("evidence"));
    expect(latestBlock).toHaveBeenCalledTimes(1);

    await act(() => result.current.refresh("appeal"));
    expect(core.readDisputeDetails).toHaveBeenCalledTimes(2);
    expect(latestBlock).toHaveBeenCalledTimes(2);
    expect(latestBlock).toHaveBeenLastCalledWith({ chainId: 1, method: "eth_getBlockByNumber", params: ["latest", false] });
  });

  it("shows nothing withdrawable after the mined withdrawals", async () => {
    programReads(4);
    const { result } = renderCaseWithRefresh();
    await settled(result);
    expect(caseDispute(result.current.data).appealPanel).toMatchObject({ status: "ready", value: { kind: "withdraw", state: { status: "available", total: 5n } } });
    vi.mocked(core.readWithdrawable).mockResolvedValue({ status: "nothing" });

    await act(() => result.current.refresh("withdraw"));

    await waitFor(() => {
      expect(caseDispute(result.current.data).appealPanel).toEqual({ status: "ready", value: { kind: "withdraw", state: { status: "nothing" } } });
    });
    expect(core.lookupDispute).toHaveBeenCalledTimes(1);
  });
});
