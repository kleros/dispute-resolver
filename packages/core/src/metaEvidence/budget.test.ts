import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubEndpoint } from "../rpc/testHelpers";
import { CASE_PAGE_BUDGET_MS, ONGOING_BUDGET_MS, loadMetaEvidence } from "./index";
import {
  CROSS_CHAIN_PROXY,
  ENV,
  HANG,
  DEFAULT_SCRIPT_CID,
  DEFAULT_SCRIPT_URL,
  META_URL,
  SINGLE_CHAIN_PROXY,
  context,
  fakeFetcher,
  fakeRunner,
  json,
  locatorUrl,
  scriptOk,
  servedMetaEvidence,
} from "./testHelpers";
import type { MetaEvidenceResult } from "./types";

const SCRIPT_JSON = json({ title: "T", dynamicScriptURI: `/ipfs/${DEFAULT_SCRIPT_CID}` });
const SCRIPT = "function getMetaEvidence() {}";

/** Starts a load, lets fake time run for `ms`, and returns the settled result with the time it took. */
async function settle(load: Promise<MetaEvidenceResult>, ms: number): Promise<{ result: MetaEvidenceResult; elapsedMs: number }> {
  const start = Date.now();
  let settledAt: number | undefined;
  const tracked = load.then((result) => {
    settledAt = Date.now();
    return result;
  });
  await vi.advanceTimersByTimeAsync(ms);
  const result = await tracked;
  if (settledAt === undefined) throw new Error("the load did not settle");
  return { result, elapsedMs: settledAt - start };
}

describe("meta-evidence budget (D-38)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("D-37, D-38: the case page budget is 120 s and the Ongoing budget is well under a minute", () => {
    expect(CASE_PAGE_BUDGET_MS).toBe(120_000);
    expect(ONGOING_BUDGET_MS).toBe(40_000);
  });

  it("D-38: transient locator failures retry every 5 s and stop within the budget with the last failure", async () => {
    const { fetcher, urls } = fakeFetcher({ [locatorUrl(1, 1684n)]: "<html>502 Bad Gateway</html>" });
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, budgetMs: 40_000 })), 60_000);
    expect(result).toMatchObject({ status: "failed", reason: "locator-error", error: { code: "rpc-error" } });
    expect(urls).toHaveLength(8);
    expect(elapsedMs).toBeLessThanOrEqual(40_000);
  });

  it("D-38: a gateway failure is retried and a later success is accepted", async () => {
    const { fetcher, urls } = fakeFetcher(servedMetaEvidence([{ status: 504, body: "Gateway Timeout" }, new TypeError("Failed to fetch"), json({ title: "Third time" })]));
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher })), 20_000);
    expect(result).toMatchObject({ status: "ok", metaEvidence: { title: "Third time" } });
    expect(urls.filter((url) => url === META_URL)).toHaveLength(3);
    expect(elapsedMs).toBe(10_000);
  });

  it("D-36, D-38: an unpinned file (mainnet 150) fails with fetch-error once the budget cannot hold another attempt", async () => {
    const { fetcher } = fakeFetcher(servedMetaEvidence({ status: 504, body: "Gateway Timeout" }, { disputeId: 150n }));
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, disputeId: 150n })), 130_000);
    expect(result).toMatchObject({ status: "failed", reason: "fetch-error" });
    expect(elapsedMs).toBeLessThanOrEqual(CASE_PAGE_BUDGET_MS);
  });

  it("D-38: deterministic failures are not retried", async () => {
    const cases: [Parameters<typeof fakeFetcher>[0], string][] = [
      [servedMetaEvidence("%PDF-1.4"), "not-json"],
      [servedMetaEvidence(json(5)), "schema-invalid"],
      [{ ...servedMetaEvidence(json({ title: "T", dynamicScriptURI: `/ipfs/${DEFAULT_SCRIPT_CID}`, arbitratorChainID: "1.0" })), [DEFAULT_SCRIPT_URL]: SCRIPT }, "unknown-chain"],
    ];
    for (const [routes, reason] of cases) {
      const { fetcher, urls } = fakeFetcher(routes);
      const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher })), 1);
      expect(result).toMatchObject({ status: "failed", reason });
      expect(elapsedMs).toBe(0);
      expect(urls.filter((url) => url === locatorUrl(1, 1684n))).toHaveLength(1);
    }
  });

  it("A2, D-38: rejections are not retried", async () => {
    const { fetcher, urls } = fakeFetcher({ [locatorUrl(1, 1684n)]: json({ metaEvidenceUri: "https://example.org/meta.json" }) });
    const { result } = await settle(loadMetaEvidence(context({ fetcher })), 1);
    expect(result).toMatchObject({ status: "invalid" });
    expect(urls).toHaveLength(1);
  });

  it("D-38: the script timeout is the budget that remains, after the time spent on earlier attempts", async () => {
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence([{ status: 502, body: "" }, SCRIPT_JSON]), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner, requests } = fakeRunner(scriptOk({ title: "From the script" }));
    const { result } = await settle(loadMetaEvidence(context({ fetcher, runner, budgetMs: ONGOING_BUDGET_MS })), 10_000);
    expect(result).toMatchObject({ status: "ok", metaEvidence: { title: "From the script" } });
    expect(requests[0]?.timeoutMs).toBe(ONGOING_BUDGET_MS - 5_000);
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("D-38: a script that never reports is cut at the budget: failed / budget-exhausted, never three minutes", async () => {
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner, requests } = fakeRunner(HANG);
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, runner })), 200_000);
    expect(result).toMatchObject({ status: "failed", reason: "budget-exhausted", error: { code: "rpc-error" } });
    expect(elapsedMs).toBe(CASE_PAGE_BUDGET_MS);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.signal?.aborted).toBe(true);
  });

  it("D-38: a runner timeout at the end of the budget is budget-exhausted", async () => {
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner } = fakeRunner(
      (request) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ status: "failed", reason: "timeout", message: "The script did not report in time." });
          }, request.timeoutMs);
        }),
    );
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, runner, budgetMs: ONGOING_BUDGET_MS })), 60_000);
    expect(result).toMatchObject({ status: "failed", reason: "budget-exhausted" });
    expect(elapsedMs).toBe(ONGOING_BUDGET_MS);
  });

  it("D-38: a failing script is retried while the budget allows, then reported as script-failed", async () => {
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner, requests } = fakeRunner({ status: "failed", reason: "script-error", message: "x is not defined" });
    const { result } = await settle(loadMetaEvidence(context({ fetcher, runner, budgetMs: 12_000 })), 20_000);
    expect(result).toMatchObject({ status: "failed", reason: "script-failed" });
    expect(requests).toHaveLength(3);
  });

  it("D-38: a fetch that ignores its abort signal is still cut by the budget", async () => {
    const { fetcher, inits } = fakeFetcher({ [locatorUrl(1, 1684n)]: HANG });
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, budgetMs: ONGOING_BUDGET_MS })), 60_000);
    expect(result).toMatchObject({ status: "failed", reason: "budget-exhausted" });
    expect(elapsedMs).toBe(ONGOING_BUDGET_MS);
    expect(inits[0]?.signal?.aborted).toBe(true);
  });

  it("A5, D-38: a failed Reality lookup is retried within the budget and then reported", async () => {
    const { fetcher, urls } = fakeFetcher(servedMetaEvidence(json({ title: "Reality question" }), { disputeId: 999_001n }));
    const { result } = await settle(loadMetaEvidence(context({ fetcher, arbitrable: CROSS_CHAIN_PROXY, disputeId: 999_001n, budgetMs: 12_000 })), 20_000);
    expect(result).toMatchObject({ status: "failed", reason: "reality-lookup-failed" });
    expect(urls.filter((url) => url === locatorUrl(1, 999_001n))).toHaveLength(3);
    expect(result.status === "failed" && result.error.message).toContain("Reality.eth question");
  });

  it("ME-1 A5 D-38: a Reality lookup through the read RPC stops its transport retries at the lookup's deadline", async () => {
    const env = { ...ENV, REACT_APP_WEB3_PROVIDER_URL: "https://read.rpc.test/budget-me-1" };
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const { fetcher } = fakeFetcher(servedMetaEvidence(json({ title: "Reality question" }), { disputeId: 999_002n }));
    const start = Date.now();
    const load = loadMetaEvidence(context({ fetcher, env, arbitrable: SINGLE_CHAIN_PROXY, disputeId: 999_002n, budgetMs: 1_000 }));
    const { result } = await settle(load, 10_000);
    expect(result).toMatchObject({ status: "failed", reason: "budget-exhausted" });
    expect(endpoint.posts.map((post) => post.at - start)).toEqual([0, 500]);
  });

  it("D-38: the caller's abort settles the load at once, without a retry; loadMetaEvidence never rejects", async () => {
    const controller = new AbortController();
    const { fetcher, urls } = fakeFetcher({ [locatorUrl(1, 1684n)]: HANG });
    const load = loadMetaEvidence(context({ fetcher, signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    const { result, elapsedMs } = await settle(load, 0);
    expect(result).toMatchObject({ status: "failed", reason: "locator-error" });
    expect(elapsedMs).toBe(0);
    expect(urls).toHaveLength(1);
  });

  it("D-38: an already aborted signal makes no request", async () => {
    const { fetcher, urls } = fakeFetcher({});
    const { result } = await settle(loadMetaEvidence(context({ fetcher, signal: AbortSignal.abort() })), 0);
    expect(result).toMatchObject({ status: "failed" });
    expect(urls).toHaveLength(0);
  });

  it("D-38: an abort during the wait before a retry ends the load with the last failure", async () => {
    const controller = new AbortController();
    const { fetcher, urls } = fakeFetcher({ [locatorUrl(1, 1684n)]: "not json" });
    const load = loadMetaEvidence(context({ fetcher, signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(2_000);
    controller.abort();
    const { result } = await settle(load, 0);
    expect(result).toMatchObject({ status: "failed", reason: "locator-error" });
    expect(urls).toHaveLength(1);
  });

  it("D-38: a zero budget fails without a request", async () => {
    const { fetcher, urls } = fakeFetcher({});
    const { result } = await settle(loadMetaEvidence(context({ fetcher, budgetMs: 0 })), 0);
    expect(result).toMatchObject({ status: "failed", reason: "budget-exhausted" });
    expect(urls).toHaveLength(0);
  });

  it("D-38: every request carries the load's abort signal", async () => {
    const { fetcher, inits } = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner } = fakeRunner(scriptOk({}));
    await settle(loadMetaEvidence(context({ fetcher, runner })), 0);
    expect(inits).toHaveLength(3);
    for (const init of inits) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
