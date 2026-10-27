import * as core from "@dispute-resolver/core";
import type { Court, MetaEvidenceResult, OngoingDispute, Outcome } from "@dispute-resolver/core";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_ARBITRABLE, createTestDeps, createTestQueryClient, dataWrapper, testCourt, testOkMetaEvidence } from "../test/data";
import { useCourts, useOngoing, useOngoingTitle } from "./ongoingHooks";
import { COURT_POLICY_FETCH_TIMEOUT_MS } from "./constants";
import { queryKeys } from "./queryKeys";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const DISPUTE: OngoingDispute = { id: 42n, arbitrated: TEST_ARBITRABLE, period: 1, subcourtId: 0n, lastPeriodChange: 1_700_000_000, countdownTarget: 1_700_086_400 };
const COURTS: Outcome<readonly Court[]> = { ok: true, value: [testCourt()] };
const COURT_CACHE_AGE_MS = 3 * 60 * 60 * 1_000;

function wrapperWith(seed: readonly (readonly [readonly unknown[], unknown])[] = [], client = createTestQueryClient(), deps = createTestDeps()) {
  return dataWrapper({ deps, client, seed });
}

function renderTitle(result: MetaEvidenceResult) {
  vi.mocked(core.loadMetaEvidence).mockResolvedValue(result);
  return renderHook(() => useOngoingTitle(1, DISPUTE), { wrapper: wrapperWith() });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Ongoing page data", () => {
  it("waits for the courts and scans the list once, with them", async () => {
    const resolvers: ((courts: Outcome<readonly Court[]>) => void)[] = [];
    vi.mocked(core.listCourts).mockReturnValue(new Promise((resolve) => resolvers.push(resolve)));
    vi.mocked(core.listOngoingDisputes).mockResolvedValue({ status: "ok", disputes: [DISPUTE], failedIds: [7n] });
    const { result } = renderHook(() => useOngoing(1), { wrapper: wrapperWith() });

    expect(result.current.list.status).toBe("loading");
    expect(core.listOngoingDisputes).not.toHaveBeenCalled();
    for (const resolve of resolvers) resolve(COURTS);

    await waitFor(() => {
      expect(result.current.list).toEqual({ status: "ready", value: { status: "ok", disputes: [DISPUTE], failedIds: [7n] } });
    });
    expect(core.listOngoingDisputes).toHaveBeenCalledTimes(1);
    expect(core.listOngoingDisputes).toHaveBeenCalledWith(expect.objectContaining({ chainId: 1 }), COURTS.value);
    expect(result.current.courts).toEqual({ status: "ready", value: COURTS.value });
  });

  /** A client holding the court list as restored from the persisted cache, written `ageMs` before the frozen now. */
  function clientWithCourtsAged(ageMs: number) {
    vi.useFakeTimers({ toFake: ["Date"] });
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.courts(1), COURTS, { updatedAt: Date.now() - ageMs });
    return client;
  }

  it("uses a court list under 3 hours old without reading the courts again", async () => {
    vi.mocked(core.listCourts).mockResolvedValue(COURTS);
    const client = clientWithCourtsAged(COURT_CACHE_AGE_MS - 1);
    const { result } = renderHook(() => useCourts(1), { wrapper: wrapperWith([], client) });
    expect(result.current).toEqual({ status: "ready", value: COURTS.value });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(core.listCourts).not.toHaveBeenCalled();
  });

  it("reads a court list 3 hours old or more again", async () => {
    vi.mocked(core.listCourts).mockResolvedValue(COURTS);
    const client = clientWithCourtsAged(COURT_CACHE_AGE_MS + 1);
    renderHook(() => useCourts(1), { wrapper: wrapperWith([], client) });
    await waitFor(() => {
      expect(core.listCourts).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps a court list nobody observes any more in memory until it is persisted", async () => {
    vi.mocked(core.listCourts).mockResolvedValue(COURTS);
    const client = createTestQueryClient();
    const { result, unmount } = renderHook(() => useCourts(1), { wrapper: wrapperWith([], client) });
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.getQueryData(queryKeys.courts(1))).toEqual(COURTS);
  });

  it("keeps a card's meta-evidence nobody observes any more in memory until it is persisted", async () => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence());
    const client = createTestQueryClient();
    const { result, unmount } = renderHook(() => useOngoingTitle(1, DISPUTE), { wrapper: wrapperWith([], client) });
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.getQueryData(queryKeys.metaEvidence(1, 42n, TEST_ARBITRABLE))).toEqual(testOkMetaEvidence());
  });

  it("bounds the courts' policy fetches, so a stalled gateway cannot hold the list back", async () => {
    vi.mocked(core.listCourts).mockReturnValue(new Promise(() => undefined));
    const stalledGateway = createTestDeps({ fetcher: () => new Promise(() => undefined) });
    renderHook(() => useOngoing(1), { wrapper: wrapperWith([], createTestQueryClient(), stalledGateway) });
    await waitFor(() => {
      expect(core.listCourts).toHaveBeenCalled();
    });
    const policyFetcher = vi.mocked(core.listCourts).mock.calls[0]?.[0].fetcher;
    expect(policyFetcher).toBeDefined();

    vi.useFakeTimers();
    const outcome = policyFetcher?.("https://cdn.kleros.link/ipfs/QmPolicy/policy.json").then(
      () => "answered",
      () => "rejected",
    );
    await vi.advanceTimersByTimeAsync(COURT_POLICY_FETCH_TIMEOUT_MS);
    expect(await Promise.race([outcome, Promise.resolve("pending")])).toBe("rejected");
  });

  it("loads a card's title with the Ongoing budget, bound to the arbitrator's arbitrable", async () => {
    const { result } = renderTitle(testOkMetaEvidence({ title: "Is the item compliant?" }));
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: { kind: "title", text: "Is the item compliant?" } });
    });
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ disputeId: 42n, arbitrable: TEST_ARBITRABLE, budgetMs: core.ONGOING_BUDGET_MS }));
    expect(vi.mocked(core.loadMetaEvidence).mock.calls[0]?.[0].onChain).toBeUndefined();
  });

  it("serves a card's title from a stored accepted meta-evidence without running the pipeline", async () => {
    const wrapper = wrapperWith([[queryKeys.metaEvidence(1, 42n, TEST_ARBITRABLE), testOkMetaEvidence({ title: "Stored title" })]]);
    const { result } = renderHook(() => useOngoingTitle(1, DISPUTE), { wrapper });
    expect(result.current).toEqual({ status: "ready", value: { kind: "title", text: "Stored title" } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(core.loadMetaEvidence).not.toHaveBeenCalled();
  });

  it("keeps a failed title briefly instead of reloading it on every mount", async () => {
    const failed: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "gateway down" } };
    const wrapper = wrapperWith([[queryKeys.metaEvidence(1, 42n, TEST_ARBITRABLE), failed]]);
    const { result } = renderHook(() => useOngoingTitle(1, DISPUTE), { wrapper });
    expect(result.current.status).toBe("unavailable");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(core.loadMetaEvidence).not.toHaveBeenCalled();
  });
});
