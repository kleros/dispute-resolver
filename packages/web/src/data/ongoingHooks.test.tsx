import * as core from "@dispute-resolver/core";
import type { Court, MetaEvidenceResult, OngoingDispute, Outcome } from "@dispute-resolver/core";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestDataProvider, createTestDeps, createTestQueryClient, testCourt, testOkMetaEvidence, TEST_ARBITRABLE } from "../test/data";
import { useCourts, useOngoing, useOngoingTitle } from "./ongoingHooks";
import { COURT_POLICY_FETCH_TIMEOUT_MS } from "./constants";
import { queryKeys } from "./queryKeys";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const DISPUTE: OngoingDispute = { id: 42n, arbitrated: TEST_ARBITRABLE, period: 1, subcourtId: 0n, lastPeriodChange: 1_700_000_000, countdownTarget: 1_700_086_400 };
const COURTS: Outcome<readonly Court[]> = { ok: true, value: [testCourt()] };
/** Today's subcourt cache is reused for 3 hours (spec §2.2, §6.5). */
const COURT_CACHE_AGE_MS = 3 * 60 * 60 * 1_000;

function wrapperWith(seed: readonly (readonly [readonly unknown[], unknown])[] = [], client = createTestQueryClient(), deps = createTestDeps()) {
  return function Wrapper({ children }: { readonly children?: ReactNode }) {
    return (
      <TestDataProvider deps={deps} client={client} seed={seed}>
        {children}
      </TestDataProvider>
    );
  };
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

describe("Ongoing page data (ARCHITECTURE.md §5.5, D-37)", () => {
  it("D-37: the list waits for the courts and scans once, with them", async () => {
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

  it("D-37: a failed court read still lists the disputes, without courts", async () => {
    vi.mocked(core.listCourts).mockResolvedValue({ ok: false, error: { code: "rpc-error", message: "down" } });
    vi.mocked(core.listOngoingDisputes).mockResolvedValue({ status: "ok", disputes: [], failedIds: [] });
    const { result } = renderHook(() => useOngoing(1), { wrapper: wrapperWith() });
    await waitFor(() => {
      expect(result.current.list.status).toBe("ready");
    });
    expect(core.listOngoingDisputes).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("spec §3: a failed scan is the list's unavailable state", async () => {
    vi.mocked(core.listCourts).mockResolvedValue(COURTS);
    vi.mocked(core.listOngoingDisputes).mockResolvedValue({ status: "failed", error: { code: "rpc-error", message: "getLogs refused" } });
    const { result } = renderHook(() => useOngoing(1), { wrapper: wrapperWith() });
    await waitFor(() => {
      expect(result.current.list).toEqual({ status: "unavailable", error: { code: "rpc-error", message: "getLogs refused" } });
    });
  });

  /** A client holding the court list as restored from the persisted cache, written `ageMs` before the frozen now. */
  function clientWithCourtsAged(ageMs: number) {
    vi.useFakeTimers({ toFake: ["Date"] });
    const client = createTestQueryClient();
    client.setQueryData(queryKeys.courts(1), COURTS, { updatedAt: Date.now() - ageMs });
    return client;
  }

  it("§2.2, §6.5: a court list under 3 hours old is used without reading the courts again", async () => {
    vi.mocked(core.listCourts).mockResolvedValue(COURTS);
    const client = clientWithCourtsAged(COURT_CACHE_AGE_MS - 1);
    const { result } = renderHook(() => useCourts(1), { wrapper: wrapperWith([], client) });
    expect(result.current).toEqual({ status: "ready", value: COURTS.value });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(core.listCourts).not.toHaveBeenCalled();
  });

  it("§2.2, §6.5: a court list 3 hours old or more is read again", async () => {
    vi.mocked(core.listCourts).mockResolvedValue(COURTS);
    const client = clientWithCourtsAged(COURT_CACHE_AGE_MS + 1);
    renderHook(() => useCourts(1), { wrapper: wrapperWith([], client) });
    await waitFor(() => {
      expect(core.listCourts).toHaveBeenCalledTimes(1);
    });
  });

  it("DATA-2 / §5.4: a court list nobody observes any more stays in memory until it is persisted", async () => {
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

  it("DATA-2 / §5.4: a card's meta-evidence nobody observes any more stays in memory until it is persisted", async () => {
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

  it("DATA-4 / D-37, D-19: the courts' policy fetches are bounded, so a stalled gateway cannot hold the list back", async () => {
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

  it("D-37: a card's title loads with the Ongoing budget, bound to the arbitrator's arbitrable", async () => {
    const { result } = renderTitle(testOkMetaEvidence({ title: "Is the item compliant?" }));
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: { kind: "title", text: "Is the item compliant?" } });
    });
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ disputeId: 42n, arbitrable: TEST_ARBITRABLE, budgetMs: core.ONGOING_BUDGET_MS }));
  });

  it("D-37: a dispute whose meta-evidence fails shows title unavailable", async () => {
    const { result } = renderTitle({ status: "failed", reason: "budget-exhausted", error: { code: "rpc-error", message: "The meta-evidence did not load in time." } });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "unavailable", error: { code: "rpc-error", message: "The meta-evidence did not load in time." } });
    });
  });

  it("spec §3: an empty title is Meta Evidence Missing", async () => {
    const { result } = renderTitle(testOkMetaEvidence({ title: "" }));
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: { kind: "missing" } });
    });
  });

  it("spec §3: a dispute the locator knows no meta-evidence for is Meta Evidence Missing", async () => {
    const { result } = renderTitle({ status: "missing" });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: { kind: "missing" } });
    });
  });

  it("A2: a rejected meta-evidence shows the placeholder title", async () => {
    const placeholder = testOkMetaEvidence({ title: "Invalid meta-evidence" }).metaEvidence;
    const { result } = renderTitle({ status: "invalid", metaEvidence: placeholder, reason: "script-not-allowlisted" });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: { kind: "title", text: "Invalid meta-evidence" } });
    });
  });

  it("§6.5: a stored accepted meta-evidence serves a card's title without running the pipeline", async () => {
    const wrapper = wrapperWith([[queryKeys.metaEvidence(1, 42n, TEST_ARBITRABLE), testOkMetaEvidence({ title: "Stored title" })]]);
    const { result } = renderHook(() => useOngoingTitle(1, DISPUTE), { wrapper });
    expect(result.current).toEqual({ status: "ready", value: { kind: "title", text: "Stored title" } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(core.loadMetaEvidence).not.toHaveBeenCalled();
  });

  it("D-38: a failed title is kept briefly instead of reloading on every mount", async () => {
    const failed: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "gateway down" } };
    const wrapper = wrapperWith([[queryKeys.metaEvidence(1, 42n, TEST_ARBITRABLE), failed]]);
    const { result } = renderHook(() => useOngoingTitle(1, DISPUTE), { wrapper });
    expect(result.current.status).toBe("unavailable");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(core.loadMetaEvidence).not.toHaveBeenCalled();
  });
});
