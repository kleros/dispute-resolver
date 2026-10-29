import * as core from "@dispute-resolver/core";
import type { DisputeEventResult, MetaEvidenceEventResult, OnChainMetaEvidence, Outcome } from "@dispute-resolver/core";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDeps, createTestQueryClient, dataWrapper, deferred, testBinding, testOkMetaEvidence } from "../test/data";
import { testPageChain } from "../test/routing";
import { useDisputeEvent, useMetaEvidence } from "./disputeHooks";
import { onChainMetaEvidenceReader } from "./onChainMetaEvidence";
import { queryKeys } from "./queryKeys";
import { noRpcError } from "./sectionData";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const BINDING = testBinding({ disputeId: 460n });
const URI = "/ipfs/QmbtSnH8BB3cgDLwtY6aT7fggnzhyEMVHExqsiVPjBxmcz/metaEvidence.json";
const TX = `0x${"58".repeat(32)}` as const;
const FAILED = { code: "rpc-error", message: "Could not read the event: down." } as const;

function disputeEvent(value: DisputeEventResult): Outcome<DisputeEventResult> {
  return { ok: true, value };
}

const FOUND_DISPUTE = disputeEvent({ status: "found", event: { metaEvidenceId: 84n, evidenceGroupId: 84n, blockNumber: 100n, createdAt: 1_747_840_645, transactionHash: TX } });
const FOUND_META: Outcome<MetaEvidenceEventResult> = {
  ok: true,
  value: { status: "found", event: { uri: URI, blockNumber: 100n, logIndex: 3, transactionHash: TX, emissions: 1 } },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("onChainMetaEvidenceReader", () => {
  it("resolves the Dispute event through the shared query and then reads the MetaEvidence event directly", async () => {
    vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_DISPUTE);
    vi.mocked(core.readMetaEvidenceEvent).mockResolvedValue(FOUND_META);
    const answers: OnChainMetaEvidence[] = [];
    const signals: AbortSignal[] = [];
    vi.mocked(core.loadMetaEvidence).mockImplementation(async (context) => {
      const controller = new AbortController();
      signals.push(controller.signal);
      if (context.onChain !== undefined) answers.push(await context.onChain(controller.signal));
      return testOkMetaEvidence();
    });
    const deps = createTestDeps();
    const { result } = renderHook(() => ({ event: useDisputeEvent(1, BINDING), metaEvidence: useMetaEvidence(1, BINDING) }), { wrapper: dataWrapper({ deps }) });
    await waitFor(() => {
      expect(result.current.metaEvidence.status).toBe("ready");
    });
    expect(result.current.event).toEqual({ status: "ready", value: FOUND_DISPUTE.ok && FOUND_DISPUTE.value });
    expect(answers).toEqual([{ status: "found", uri: URI }]);
    expect(core.readDisputeEvent).toHaveBeenCalledTimes(1);
    expect(core.readMetaEvidenceEvent).toHaveBeenCalledTimes(1);
    expect(core.readMetaEvidenceEvent).toHaveBeenCalledWith({
      client: deps.getReadClient(1),
      arbitrable: BINDING.arbitrated,
      metaEvidenceId: 84n,
      fromBlock: core.evidenceScanStart(testPageChain(1).chain),
      signal: signals[0],
    });
  });

  it("reads the MetaEvidence event again on a second load, so a re-emission between two loads is seen", async () => {
    vi.mocked(core.readDisputeEvent).mockResolvedValue(FOUND_DISPUTE);
    const reemitted: Outcome<MetaEvidenceEventResult> = {
      ok: true,
      value: { status: "found", event: { uri: "/ipfs/QmReemitted/metaEvidence.json", blockNumber: 200n, logIndex: 0, transactionHash: TX, emissions: 2 } },
    };
    vi.mocked(core.readMetaEvidenceEvent).mockResolvedValueOnce(FOUND_META).mockResolvedValueOnce(reemitted);
    const reader = onChainMetaEvidenceReader(createTestQueryClient(), createTestDeps(), 1, BINDING);
    expect(await reader(new AbortController().signal)).toEqual({ status: "found", uri: URI });
    expect(await reader(new AbortController().signal)).toEqual({ status: "found", uri: "/ipfs/QmReemitted/metaEvidence.json" });
    expect(core.readMetaEvidenceEvent).toHaveBeenCalledTimes(2);
    expect(core.readDisputeEvent).toHaveBeenCalledTimes(1);
  });

  it("aborts the MetaEvidence read with the load and leaves the shared Dispute-event query running", async () => {
    const client = createTestQueryClient();
    const deps = createTestDeps();
    const key = queryKeys.disputeEvent(1, BINDING.disputeId, BINDING.arbitrated);
    const pending = deferred<Outcome<DisputeEventResult>>();
    vi.mocked(core.readDisputeEvent).mockReturnValue(pending.promise);
    const waiting = new AbortController();
    const first = onChainMetaEvidenceReader(client, deps, 1, BINDING)(waiting.signal);
    await waitFor(() => {
      expect(client.getQueryState(key)?.fetchStatus).toBe("fetching");
    });
    waiting.abort();
    await expect(first).rejects.toThrow();
    expect(client.getQueryState(key)?.fetchStatus).toBe("fetching");
    pending.resolve(FOUND_DISPUTE);
    await waitFor(() => {
      expect(client.getQueryData(key)).toEqual(FOUND_DISPUTE);
    });
    expect(core.readMetaEvidenceEvent).not.toHaveBeenCalled();

    const reading = new AbortController();
    const seen: AbortSignal[] = [];
    const aborted = { code: "rpc-error", message: "Could not read the MetaEvidence event: The request was aborted." } as const;
    vi.mocked(core.readMetaEvidenceEvent).mockImplementation(
      ({ signal }) =>
        new Promise((resolve) => {
          if (signal !== undefined) seen.push(signal);
          signal?.addEventListener("abort", () => {
            resolve({ ok: false, error: aborted });
          });
        }),
    );
    const second = onChainMetaEvidenceReader(client, deps, 1, BINDING)(reading.signal);
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    reading.abort();
    expect(await second).toEqual({ status: "unavailable", error: aborted });
    expect(seen[0]).toBe(reading.signal);
    expect(seen[0]?.aborted).toBe(true);
    expect(core.readDisputeEvent).toHaveBeenCalledTimes(1);
  });

  it("maps not-found and ambiguous Dispute events, a missing MetaEvidence log and a failed read to the fallback reasons", async () => {
    const cases: [Outcome<DisputeEventResult>, Outcome<MetaEvidenceEventResult> | null, OnChainMetaEvidence][] = [
      [disputeEvent({ status: "not-found" }), null, { status: "not-found", reason: "dispute-event-not-found" }],
      [disputeEvent({ status: "ambiguous", count: 2 }), null, { status: "not-found", reason: "dispute-event-ambiguous" }],
      [{ ok: false, error: FAILED }, null, { status: "unavailable", error: FAILED }],
      [FOUND_DISPUTE, { ok: true, value: { status: "not-found" } }, { status: "not-found", reason: "meta-evidence-event-not-found" }],
      [FOUND_DISPUTE, { ok: false, error: FAILED }, { status: "unavailable", error: FAILED }],
    ];
    for (const [dispute, meta, expected] of cases) {
      vi.clearAllMocks();
      vi.mocked(core.readDisputeEvent).mockResolvedValue(dispute);
      if (meta !== null) vi.mocked(core.readMetaEvidenceEvent).mockResolvedValue(meta);
      const reader = onChainMetaEvidenceReader(createTestQueryClient(), createTestDeps(), 1, BINDING);
      expect(await reader(new AbortController().signal)).toEqual(expected);
      expect(core.readMetaEvidenceEvent).toHaveBeenCalledTimes(meta === null ? 0 : 1);
    }
  });

  it("is unavailable without reading on a chain without a read RPC", async () => {
    const reader = onChainMetaEvidenceReader(createTestQueryClient(), createTestDeps({ unconfiguredChains: [1] }), 1, BINDING);
    expect(await reader(new AbortController().signal)).toEqual({ status: "unavailable", error: noRpcError(1) });
    expect(core.readDisputeEvent).not.toHaveBeenCalled();
    expect(core.readMetaEvidenceEvent).not.toHaveBeenCalled();
  });

  it("re-reads a Dispute event whose previous read failed on the next load", async () => {
    vi.mocked(core.readDisputeEvent).mockResolvedValueOnce({ ok: false, error: FAILED }).mockResolvedValue(FOUND_DISPUTE);
    vi.mocked(core.readMetaEvidenceEvent).mockResolvedValue(FOUND_META);
    const reader = onChainMetaEvidenceReader(createTestQueryClient(), createTestDeps(), 1, BINDING);
    expect(await reader(new AbortController().signal)).toEqual({ status: "unavailable", error: FAILED });
    expect(await reader(new AbortController().signal)).toEqual({ status: "found", uri: URI });
    expect(await reader(new AbortController().signal)).toEqual({ status: "found", uri: URI });
    expect(core.readDisputeEvent).toHaveBeenCalledTimes(2);
  });
});
