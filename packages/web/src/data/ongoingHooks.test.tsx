import * as core from "@dispute-resolver/core";
import type { Court, MetaEvidenceResult, OngoingDispute, Outcome } from "@dispute-resolver/core";
import type { QueryKey } from "@tanstack/react-query";
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

  it.each<[string, () => { readonly status: string }, QueryKey, unknown]>([
    ["a court list", () => useCourts(1), queryKeys.courts(1), COURTS],
    ["a card's meta-evidence", () => useOngoingTitle(1, DISPUTE), queryKeys.metaEvidence(1, 42n, TEST_ARBITRABLE), testOkMetaEvidence()],
  ])("keeps %s nobody observes any more in memory until it is persisted", async (_name, hook, key, expected) => {
    vi.mocked(core.listCourts).mockResolvedValue(COURTS);
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence());
    const client = createTestQueryClient();
    const { result, unmount } = renderHook(hook, { wrapper: wrapperWith([], client) });
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.getQueryData(key)).toEqual(expected);
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

  it.each<[string, MetaEvidenceResult, object]>([
    [
      "serves a card's title from a stored accepted meta-evidence",
      testOkMetaEvidence({ title: "Stored title" }),
      { status: "ready", value: { kind: "title", text: "Stored title" } },
    ],
    [
      "keeps a failed title briefly instead of reloading it on every mount",
      { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "gateway down" } },
      { status: "unavailable" },
    ],
  ])("%s, without running the pipeline", async (_name, stored, expected) => {
    const wrapper = wrapperWith([[queryKeys.metaEvidence(1, 42n, TEST_ARBITRABLE), stored]]);
    const { result } = renderHook(() => useOngoingTitle(1, DISPUTE), { wrapper });
    expect(result.current).toMatchObject(expected);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(core.loadMetaEvidence).not.toHaveBeenCalled();
  });
});
