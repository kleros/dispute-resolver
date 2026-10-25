import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BodyTooLargeError } from "../fetch";
import { stubEndpoint } from "../test/rpc/testHelpers";
import type { Fetcher, ScriptResult } from "../types";
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
  settle,
} from "../test/metaEvidence/testHelpers";

const SCRIPT_JSON = json({ title: "T", dynamicScriptURI: `/ipfs/${DEFAULT_SCRIPT_CID}` });
const SCRIPT = "function getMetaEvidence() {}";

/** The host's answer for a runner page that has not acknowledged the run within its window; core never sees the window. */
const NOT_STARTED_MESSAGE = "The dynamic script's runner did not start in time.";
const ACKNOWLEDGEMENT_WAIT_MS = 5_000;

function notStartedAfterWindow(): Promise<ScriptResult> {
  return new Promise((resolve) => {
    setTimeout(resolve, ACKNOWLEDGEMENT_WAIT_MS, { status: "failed", reason: "not-started", message: NOT_STARTED_MESSAGE });
  });
}

describe("meta-evidence budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("the case page budget is 120 s and the Ongoing budget is well under a minute", () => {
    expect(CASE_PAGE_BUDGET_MS).toBe(120_000);
    expect(ONGOING_BUDGET_MS).toBe(40_000);
  });

  it("transient locator failures retry every 5 s and stop within the budget with the last failure", async () => {
    const { fetcher, urls } = fakeFetcher({ [locatorUrl(1, 1684n)]: "<html>502 Bad Gateway</html>" });
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, budgetMs: 40_000 })), 60_000);
    expect(result).toMatchObject({ status: "failed", reason: "locator-error", error: { code: "rpc-error" } });
    expect(urls).toHaveLength(8);
    expect(elapsedMs).toBeLessThanOrEqual(40_000);
  });

  it("a gateway failure is retried and a later success is accepted", async () => {
    const { fetcher, urls } = fakeFetcher(servedMetaEvidence([{ status: 504, body: "Gateway Timeout" }, new TypeError("Failed to fetch"), json({ title: "Third time" })]));
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher })), 20_000);
    expect(result).toMatchObject({ status: "ok", metaEvidence: { title: "Third time" } });
    expect(urls.filter((url) => url === META_URL)).toHaveLength(3);
    expect(elapsedMs).toBe(10_000);
  });

  it("an unpinned file (mainnet 150) fails with fetch-error once the budget cannot hold another attempt", async () => {
    const { fetcher } = fakeFetcher(servedMetaEvidence({ status: 504, body: "Gateway Timeout" }, { disputeId: 150n }));
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, disputeId: 150n })), 130_000);
    expect(result).toMatchObject({ status: "failed", reason: "fetch-error" });
    expect(elapsedMs).toBeLessThanOrEqual(CASE_PAGE_BUDGET_MS);
  });

  it("deterministic outcomes are not retried", async () => {
    const cases: [Parameters<typeof fakeFetcher>[0], Record<string, unknown>][] = [
      [servedMetaEvidence("%PDF-1.4"), { status: "failed", reason: "not-json" }],
      [servedMetaEvidence(json(5)), { status: "failed", reason: "schema-invalid" }],
    ];
    for (const [routes, expected] of cases) {
      const { fetcher, urls } = fakeFetcher(routes);
      const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher })), 1);
      expect(result).toMatchObject(expected);
      expect(elapsedMs).toBe(0);
      expect(urls.filter((url) => url === locatorUrl(1, 1684n))).toHaveLength(1);
    }
  });

  it("a meta-evidence body over the fetch cap fails at once, without a retry", async () => {
    const base = fakeFetcher(servedMetaEvidence(json({ title: "Huge" })));
    const fetcher: Fetcher = async (url, init) => {
      const response = await base.fetcher(url, init);
      return url === META_URL ? { ...response, json: () => Promise.reject(new BodyTooLargeError(1)), text: () => Promise.reject(new BodyTooLargeError(1)) } : response;
    };
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher })), 10_000);
    expect(result).toMatchObject({ status: "failed", reason: "fetch-error", error: { code: "invalid-data" } });
    expect(elapsedMs).toBe(0);
    expect(base.urls.filter((url) => url === META_URL)).toHaveLength(1);
  });

  it("a dynamic script over the fetch cap leaves the meta-evidence without a merge, without a retry", async () => {
    const base = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const fetcher: Fetcher = (url, init) => (url === DEFAULT_SCRIPT_URL ? Promise.reject(new BodyTooLargeError(1)) : base.fetcher(url, init));
    const { runner, requests } = fakeRunner(scriptOk({ title: "From the script" }));
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, runner })), 10_000);
    expect(result).toMatchObject({ status: "ok", metaEvidence: { title: "T" }, script: { ran: false, reason: "script-fetch-failed" } });
    expect(requests).toHaveLength(0);
    expect(elapsedMs).toBe(0);
  });

  it("rejections are not retried", async () => {
    const { fetcher, urls } = fakeFetcher({ [locatorUrl(1, 1684n)]: json({ metaEvidenceUri: "https://example.org/meta.json" }) });
    const { result } = await settle(loadMetaEvidence(context({ fetcher })), 1);
    expect(result).toMatchObject({ status: "invalid" });
    expect(urls).toHaveLength(1);
  });

  it("the script timeout is the budget that remains, after the time spent on earlier attempts", async () => {
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence([{ status: 502, body: "" }, SCRIPT_JSON]), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner, requests } = fakeRunner(scriptOk({ title: "From the script" }));
    const { result } = await settle(loadMetaEvidence(context({ fetcher, runner, budgetMs: ONGOING_BUDGET_MS })), 10_000);
    expect(result).toMatchObject({ status: "ok", metaEvidence: { title: "From the script" } });
    expect(requests[0]?.timeoutMs).toBe(ONGOING_BUDGET_MS - 5_000);
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("a script that never reports is cut at the budget: failed / budget-exhausted", async () => {
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner, requests } = fakeRunner(HANG);
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, runner })), 200_000);
    expect(result).toMatchObject({ status: "failed", reason: "budget-exhausted", error: { code: "rpc-error" } });
    expect(elapsedMs).toBe(CASE_PAGE_BUDGET_MS);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.signal?.aborted).toBe(true);
  });

  it("a runner timeout at the end of the budget is budget-exhausted", async () => {
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

  it("a failing script is retried while the budget allows, then reported as script-failed", async () => {
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner, requests } = fakeRunner({ status: "failed", reason: "script-error", message: "x is not defined" });
    const { result } = await settle(loadMetaEvidence(context({ fetcher, runner, budgetMs: 12_000 })), 20_000);
    expect(result).toMatchObject({ status: "failed", reason: "script-failed" });
    expect(requests).toHaveLength(3);
  });

  it("a runner-error result is final: reported as script-failed at once, never retried", async () => {
    const message = "The script runner sent a malformed reply.";
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner, requests } = fakeRunner({ status: "failed", reason: "runner-error", message });
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, runner, budgetMs: 12_000 })), 20_000);
    expect(result).toEqual({ status: "failed", reason: "script-failed", error: { code: "rpc-error", message } });
    expect(requests).toHaveLength(1);
    expect(elapsedMs).toBe(0);
  });

  it("a runner that did not start is retried while the budget allows, then reported with the runner's own message", async () => {
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner, requests } = fakeRunner(notStartedAfterWindow);
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, runner, budgetMs: 30_000 })), 40_000);
    expect(result).toEqual({ status: "failed", reason: "script-failed", error: { code: "rpc-error", message: NOT_STARTED_MESSAGE } });
    expect(requests).toHaveLength(3);
    expect(elapsedMs).toBe(25_000);
  });

  it("a runner that starts late is not a final failure: the retry renders the script's result", async () => {
    const { fetcher } = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    let runs = 0;
    const { runner, requests } = fakeRunner(() => {
      runs += 1;
      return runs === 1 ? notStartedAfterWindow() : scriptOk({ title: "From the script" });
    });
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, runner })), 20_000);
    expect(result).toMatchObject({ status: "ok", metaEvidence: { title: "From the script" }, script: { ran: true } });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.timeoutMs).toBe(CASE_PAGE_BUDGET_MS - 10_000);
    expect(elapsedMs).toBe(10_000);
  });

  it("a fetch that ignores its abort signal is still cut by the budget", async () => {
    const { fetcher, inits } = fakeFetcher({ [locatorUrl(1, 1684n)]: HANG });
    const { result, elapsedMs } = await settle(loadMetaEvidence(context({ fetcher, budgetMs: ONGOING_BUDGET_MS })), 60_000);
    expect(result).toMatchObject({ status: "failed", reason: "budget-exhausted" });
    expect(elapsedMs).toBe(ONGOING_BUDGET_MS);
    expect(inits[0]?.signal?.aborted).toBe(true);
  });

  it("a failed Reality lookup is retried within the budget and then reported", async () => {
    const { fetcher, urls } = fakeFetcher(servedMetaEvidence(json({ title: "Reality question" }), { disputeId: 999_001n }));
    const { result } = await settle(loadMetaEvidence(context({ fetcher, arbitrable: CROSS_CHAIN_PROXY, disputeId: 999_001n, budgetMs: 12_000 })), 20_000);
    expect(result).toMatchObject({ status: "failed", reason: "reality-lookup-failed" });
    expect(urls.filter((url) => url === locatorUrl(1, 999_001n))).toHaveLength(3);
    expect(result.status === "failed" && result.error.message).toContain("Reality.eth question");
  });

  it("a Reality lookup through the read RPC stops its transport retries at the lookup's deadline", async () => {
    const env = { ...ENV, REACT_APP_WEB3_PROVIDER_URL: "https://read.rpc.test/budget-me-1" };
    const endpoint = stubEndpoint(() => ({ status: 503 }));
    const { fetcher } = fakeFetcher(servedMetaEvidence(json({ title: "Reality question" }), { disputeId: 999_002n }));
    const start = Date.now();
    const load = loadMetaEvidence(context({ fetcher, env, arbitrable: SINGLE_CHAIN_PROXY, disputeId: 999_002n, budgetMs: 1_000 }));
    const { result } = await settle(load, 10_000);
    expect(result).toMatchObject({ status: "failed", reason: "budget-exhausted" });
    expect(endpoint.posts.map((post) => post.at - start)).toEqual([0, 500]);
  });

  it("the caller's abort settles the load at once, without a retry; loadMetaEvidence never rejects", async () => {
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

  it("an already aborted signal makes no request", async () => {
    const { fetcher, urls } = fakeFetcher({});
    const { result } = await settle(loadMetaEvidence(context({ fetcher, signal: AbortSignal.abort() })), 0);
    expect(result).toMatchObject({ status: "failed" });
    expect(urls).toHaveLength(0);
  });

  it("an abort during the wait before a retry ends the load with the last failure", async () => {
    const controller = new AbortController();
    const { fetcher, urls } = fakeFetcher({ [locatorUrl(1, 1684n)]: "not json" });
    const load = loadMetaEvidence(context({ fetcher, signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(2_000);
    controller.abort();
    const { result } = await settle(load, 0);
    expect(result).toMatchObject({ status: "failed", reason: "locator-error" });
    expect(urls).toHaveLength(1);
  });

  it("a zero budget fails without a request", async () => {
    const { fetcher, urls } = fakeFetcher({});
    const { result } = await settle(loadMetaEvidence(context({ fetcher, budgetMs: 0 })), 0);
    expect(result).toMatchObject({ status: "failed", reason: "budget-exhausted" });
    expect(urls).toHaveLength(0);
  });

  it("every request carries the load's abort signal", async () => {
    const { fetcher, inits } = fakeFetcher({ ...servedMetaEvidence(SCRIPT_JSON), [DEFAULT_SCRIPT_URL]: SCRIPT });
    const { runner } = fakeRunner(scriptOk({}));
    await settle(loadMetaEvidence(context({ fetcher, runner })), 0);
    expect(inits).toHaveLength(3);
    for (const init of inits) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
