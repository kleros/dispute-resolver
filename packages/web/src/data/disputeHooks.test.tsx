import * as core from "@dispute-resolver/core";
import type { ArbitratedBinding, MetaEvidenceResult } from "@dispute-resolver/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { HttpRequestError } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestDataProvider, createTestDeps, testBinding, testFamily, testOkMetaEvidence } from "../test/data";
import { useFamily, useMetaEvidence } from "./disputeHooks";
import { metaEvidenceStaleTime } from "./metaEvidenceQuery";
import { useOngoingTitle } from "./ongoingHooks";
import { queryKeys } from "./queryKeys";
import type { CoreDeps } from "./types";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const BINDING = testBinding({ disputeId: 9n });
const FAILED: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "gateway down" } };

const STORED_KEY = queryKeys.metaEvidence(1, 9n, BINDING.arbitrated);

type Seed = readonly (readonly [readonly unknown[], unknown])[];

function wrapperWith(deps: CoreDeps, seed: Seed = []) {
  return function Wrapper({ children }: { readonly children?: ReactNode }) {
    return (
      <TestDataProvider deps={deps} seed={seed}>
        {children}
      </TestDataProvider>
    );
  };
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

describe("dispute hooks", () => {
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

  it("reloads a stored failed meta-evidence when the case page mounts", async () => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence());
    const deps = createTestDeps();
    const { result } = renderHook(() => useMetaEvidence(1, BINDING, "case"), { wrapper: wrapperWith(deps, [[queryKeys.metaEvidence(1, 9n, BINDING.arbitrated), FAILED]]) });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: testOkMetaEvidence() });
    });
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ budgetMs: core.CASE_PAGE_BUDGET_MS, arbitrable: BINDING.arbitrated, disputeId: 9n }));
  });

  it("runs the meta-evidence pipeline when the case page mounts and shows no stored result meanwhile", async () => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence({ title: "Fresh title" }));
    const stored = testOkMetaEvidence({ title: "Stored title" });
    const { result } = renderHook(() => useMetaEvidence(1, BINDING, "case"), {
      wrapper: wrapperWith(createTestDeps(), [[queryKeys.metaEvidence(1, 9n, BINDING.arbitrated), stored]]),
    });
    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: testOkMetaEvidence({ title: "Fresh title" }) });
    });
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ budgetMs: core.CASE_PAGE_BUDGET_MS, arbitrable: BINDING.arbitrated, disputeId: 9n }));
  });

  it("runs the case page's meta-evidence pipeline when the binding arrives after mount although an ok result is stored", async () => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence({ title: "Fresh title" }));
    const { result, rerender } = renderCaseMetaEvidence([[STORED_KEY, testOkMetaEvidence({ title: "Stored title" })]]);
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

  it("runs the pipeline again for a failure stored less than 30 seconds ago when the binding arrives after mount", async () => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence({ title: "Fresh title" }));
    const { result, rerender } = renderCaseMetaEvidence([[STORED_KEY, FAILED]]);
    rerender({ binding: BINDING });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: testOkMetaEvidence({ title: "Fresh title" }) });
    });
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
  });

  it("serves an Ongoing card from the stored ok result without running the pipeline", async () => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence({ title: "Fresh title" }));
    const ongoing = { id: 9n, arbitrated: BINDING.arbitrated, period: 0, subcourtId: 0n, lastPeriodChange: 0, countdownTarget: null } as const;
    const { result } = renderHook(() => useOngoingTitle(1, ongoing), {
      wrapper: wrapperWith(createTestDeps(), [[STORED_KEY, testOkMetaEvidence({ title: "Stored title" })]]),
    });
    expect(result.current).toEqual({ status: "ready", value: { kind: "title", text: "Stored title" } });
    await act(() => Promise.resolve());
    expect(core.loadMetaEvidence).not.toHaveBeenCalled();
  });

  it("passes an on-chain reader to the case page's meta-evidence load but not to an Ongoing title's", async () => {
    vi.mocked(core.loadMetaEvidence).mockResolvedValue(testOkMetaEvidence({ title: "Loaded" }));
    const casePage = renderHook(() => useMetaEvidence(1, BINDING, "case"), { wrapper: wrapperWith(createTestDeps()) });
    await waitFor(() => {
      expect(casePage.result.current.status).toBe("ready");
    });
    expect(core.loadMetaEvidence).toHaveBeenCalledWith(expect.objectContaining({ budgetMs: core.CASE_PAGE_BUDGET_MS, onChain: expect.any(Function) as unknown }));
    casePage.unmount();

    vi.mocked(core.loadMetaEvidence).mockClear();
    const ongoing = { id: 10n, arbitrated: BINDING.arbitrated, period: 0, subcourtId: 0n, lastPeriodChange: 0, countdownTarget: null } as const;
    const card = renderHook(() => useOngoingTitle(1, ongoing), { wrapper: wrapperWith(createTestDeps()) });
    await waitFor(() => {
      expect(card.result.current.status).toBe("ready");
    });
    expect(core.loadMetaEvidence).toHaveBeenCalledTimes(1);
    expect(vi.mocked(core.loadMetaEvidence).mock.calls[0]?.[0]).toMatchObject({ budgetMs: core.ONGOING_BUDGET_MS });
    expect(vi.mocked(core.loadMetaEvidence).mock.calls[0]?.[0].onChain).toBeUndefined();
  });

  it("keeps accepted meta-evidence fresh forever, failed or missing results for 30 seconds, and rejections not at all", () => {
    expect(metaEvidenceStaleTime(testOkMetaEvidence())).toBe(Number.POSITIVE_INFINITY);
    expect(metaEvidenceStaleTime(FAILED)).toBe(30_000);
    expect(metaEvidenceStaleTime({ status: "missing" })).toBe(30_000);
    expect(metaEvidenceStaleTime({ status: "invalid", metaEvidence: testOkMetaEvidence().metaEvidence, reason: "script-not-allowlisted" })).toBe(0);
    expect(metaEvidenceStaleTime(undefined)).toBe(0);
  });
});
