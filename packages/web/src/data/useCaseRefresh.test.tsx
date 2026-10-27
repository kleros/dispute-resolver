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

function programReads(): void {
  vi.mocked(core.lookupDispute).mockResolvedValue(testFoundLookup({ period: 3 }));
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
    programReads();
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

  it("a refresh after a mined funding reads the details, the round's funding from the Dispute event, the evidence and the chain time again", async () => {
    programReads();
    const { result } = renderCaseWithRefresh();
    await settled(result);
    await waitFor(() => {
      expect(latestBlock).toHaveBeenCalledTimes(1);
    });

    await act(() => result.current.refresh("evidence"));
    expect(latestBlock).toHaveBeenCalledTimes(1);

    await act(() => result.current.refresh("appeal"));
    expect(core.readDisputeDetails).toHaveBeenCalledTimes(2);
    expect(core.loadEvidence).toHaveBeenCalledTimes(3);
    expect(core.readRoundFunding).toHaveBeenCalledTimes(2);
    expect(core.readRoundFunding).toHaveBeenLastCalledWith(expect.anything(), 0n, 100n);
    expect(latestBlock).toHaveBeenCalledTimes(2);
    expect(latestBlock).toHaveBeenLastCalledWith({ chainId: 1, method: "eth_getBlockByNumber", params: ["latest", false] });
  });
});
