import * as core from "@dispute-resolver/core";
import type { ArbitratedBinding, MetaEvidenceResult } from "@dispute-resolver/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpRequestError } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDeps, dataWrapper, testBinding, testDisputeEvent, testEvidenceList, testFamily, testOkMetaEvidence } from "../test/data";
import { EVIDENCE_FETCH_TIMEOUT_MS } from "./constants";
import { useEvidence, useFamily, useMetaEvidence } from "./disputeHooks";
import { metaEvidenceStaleTime } from "./metaEvidenceQuery";
import { queryKeys } from "./queryKeys";
import { ready } from "./sectionData";
import type { CoreDeps } from "./types";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const BINDING = testBinding({ disputeId: 9n });
const FAILED: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "gateway down" } };

const STORED_KEY = queryKeys.metaEvidence(1, 9n, BINDING.arbitrated);

type Seed = readonly (readonly [readonly unknown[], unknown])[];

function wrapperWith(deps: CoreDeps, seed: Seed = []) {
  return dataWrapper({ deps, seed });
}

/** The case page's meta-evidence before its lookup settles, as `useCase` mounts it. */
function renderCaseMetaEvidence(seed: Seed) {
  const unbound: { readonly binding: ArbitratedBinding | undefined } = { binding: undefined };
  return renderHook(({ binding }: { readonly binding: ArbitratedBinding | undefined }) => useMetaEvidence(1, binding, "case"), {
    initialProps: unbound,
    wrapper: wrapperWith(createTestDeps(), seed),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

const FOUND_EVENT = testDisputeEvent({ blockNumber: 10n, transactionHash: `0x${"ab".repeat(32)}` });

describe("dispute hooks", () => {
  it("cuts an evidence document fetch that never answers at the evidence timeout", async () => {
    vi.mocked(core.loadEvidence).mockResolvedValue({ ok: true, value: testEvidenceList() });
    const deps = createTestDeps({ fetcher: () => new Promise(() => undefined) });
    renderHook(() => useEvidence(1, BINDING, ready(FOUND_EVENT)), { wrapper: wrapperWith(deps) });
    await waitFor(() => {
      expect(core.loadEvidence).toHaveBeenCalled();
    });
    const context = vi.mocked(core.loadEvidence).mock.calls[0]?.[0];
    if (context === undefined) throw new Error("loadEvidence was not called");

    vi.useFakeTimers();
    const outcome = context.fetcher("https://cdn.kleros.link/ipfs/QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA").then(
      () => "answered",
      (error: unknown) => (error instanceof DOMException ? error.name : "rejected"),
    );
    await vi.advanceTimersByTimeAsync(EVIDENCE_FETCH_TIMEOUT_MS);
    await expect(Promise.race([outcome, Promise.resolve("pending")])).resolves.toBe("TimeoutError");
  });

  it("detects the family through the chain's configured read client and the session cache", async () => {
    vi.mocked(core.detectFamily).mockResolvedValue(testFamily());
    const deps = createTestDeps();
    const { result } = renderHook(() => useFamily(1, BINDING.arbitrated), { wrapper: wrapperWith(deps) });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: testFamily() });
    });
    expect(core.detectFamily).toHaveBeenCalledWith({ client: deps.getReadClient(1), chainId: 1, arbitrable: BINDING.arbitrated, registry: deps.registry, cache: deps.familyCache });
  });

  it("retries a rejected family detection once, then reports it unavailable by the error's short message, without the RPC URL", async () => {
    vi.mocked(core.detectFamily).mockRejectedValue(new HttpRequestError({ body: { method: "eth_getCode" }, status: 429, url: "https://rpc.example/v2/abc123SECRETxyz" }));
    const { result } = renderHook(() => useFamily(1, BINDING.arbitrated), { wrapper: wrapperWith(createTestDeps()) });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "unavailable", error: { code: "rpc-error", message: "HTTP request failed." } });
    });
    expect(core.detectFamily).toHaveBeenCalledTimes(2);
  });

  const STORED = [
    ["a stored ok result", testOkMetaEvidence({ title: "Stored title" })],
    ["a failure stored less than 30 seconds ago", FAILED],
  ] as const;

  it.each(STORED)("runs the meta-evidence pipeline when the case page mounts over %s and shows no stored result meanwhile", async (_stored, stored) => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence({ title: "Fresh title" }));
    const { result } = renderHook(() => useMetaEvidence(1, BINDING, "case"), { wrapper: wrapperWith(createTestDeps(), [[STORED_KEY, stored]]) });
    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: testOkMetaEvidence({ title: "Fresh title" }) });
    });
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ budgetMs: core.CASE_PAGE_BUDGET_MS, arbitrable: BINDING.arbitrated, disputeId: 9n }));
  });

  it.each(STORED)("runs the case page's meta-evidence pipeline when the binding arrives after mount, over %s", async (_stored, stored) => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence({ title: "Fresh title" }));
    const { result, rerender } = renderCaseMetaEvidence([[STORED_KEY, stored]]);
    expect(result.current).toEqual({ status: "loading" });
    rerender({ binding: BINDING });
    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: testOkMetaEvidence({ title: "Fresh title" }) });
    });
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ budgetMs: core.CASE_PAGE_BUDGET_MS, arbitrable: BINDING.arbitrated, disputeId: 9n }));
    rerender({ binding: BINDING });
    await act(() => Promise.resolve());
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
  });

  it("keeps accepted meta-evidence fresh forever, failed or missing results for 30 seconds, and rejections not at all", () => {
    expect(metaEvidenceStaleTime(testOkMetaEvidence())).toBe(Number.POSITIVE_INFINITY);
    expect(metaEvidenceStaleTime(FAILED)).toBe(30_000);
    expect(metaEvidenceStaleTime({ status: "missing" })).toBe(30_000);
    expect(metaEvidenceStaleTime({ status: "invalid", metaEvidence: testOkMetaEvidence().metaEvidence, reason: "script-not-allowlisted" })).toBe(0);
    expect(metaEvidenceStaleTime(undefined)).toBe(0);
  });
});
