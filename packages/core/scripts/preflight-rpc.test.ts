import { parseAbiItem } from "viem";
import { describe, expect, it } from "vitest";
import { CHAINS } from "../src/chains";
import { getLogsChunked } from "../src/rpc";
import { fakeLogsClient, rangeRefusal } from "../src/rpc/testHelpers";
import type { Env } from "../src/types";
import { MIN_WINDOW_BLOCKS, checkEndpoint, formatChainReport, isFailure, redact, runPreflight, summarize, type FetchLike } from "./preflight-rpc";

const HEAD = 24_000_000;
const URL_WITH_KEY = "https://eth-mainnet.example-provider.io/v3/0123456789abcdef0123456789abcdef?apikey=secretvalue123";

interface NodeOptions {
  /** The answer to `eth_getLogs`: a result, a JSON-RPC error or an HTTP status with a body. */
  readonly logs?: { readonly error: { readonly code: number; readonly message: string } } | { readonly status: number; readonly body?: string } | "ok";
  /** The widest `eth_getLogs` range, in blocks, answered with an empty list; a wider one gets `logs`. Unset: every range gets `logs`. */
  readonly logsCap?: number;
  /**
   * The answer to the CORS preflight (`OPTIONS`): `status` defaults to 204. With `redirect`, it is a 301 that a client
   * following redirects never sees: it gets the target's 204 with `ALLOW_ALL` instead, as undici's `fetch` does.
   */
  readonly preflight?: { readonly status?: number; readonly headers?: Record<string, string>; readonly redirect?: boolean };
  /** The `POST` answers are a 301 to another URL, followed the same way as a redirected preflight. */
  readonly postRedirect?: boolean;
  /** The `Access-Control-Allow-Origin` of the `POST` answers; `undefined` sends none. */
  readonly postAllowOrigin?: string;
  readonly failWith?: Error;
  readonly head?: number;
}

interface Recorded {
  readonly method: string;
  readonly origin: string | undefined;
  readonly rpcMethod: string | undefined;
  readonly params: readonly unknown[];
  readonly requestHeaders: string | undefined;
  readonly redirect: RequestInit["redirect"];
}

const ALLOW_ALL: Record<string, string> = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST" };

/** A permanent redirect to another URL. */
function moved(): Response {
  return new Response(null, { status: 301, headers: { location: "https://elsewhere.example/k/" } });
}

interface RpcBody {
  readonly method: string;
  readonly params: unknown[];
  readonly id: number;
}

/** Whether a request follows redirects, as `fetch` does unless told `manual` or `error`. */
function followsRedirects(init: RequestInit): boolean {
  return init.redirect !== "manual" && init.redirect !== "error";
}

/** The answer to the CORS preflight. */
function preflightAnswer(options: NodeOptions, init: RequestInit): Response {
  const { status = 204, headers = ALLOW_ALL, redirect = false } = options.preflight ?? {};
  if (!redirect) return new Response(null, { status, headers });
  return followsRedirects(init) ? new Response(null, { status: 204, headers: ALLOW_ALL }) : moved();
}

/** The number of blocks an `eth_getLogs` call asks for. */
function logsSpan(body: RpcBody): number {
  const [filter] = body.params as [{ fromBlock: string; toBlock: string }];
  return Number(BigInt(filter.toBlock)) - Number(BigInt(filter.fromBlock)) + 1;
}

/** The answer to a JSON-RPC `POST`. */
function rpcAnswer(options: NodeOptions, body: RpcBody): Response {
  const headers: Record<string, string> = options.postAllowOrigin === undefined ? {} : { "access-control-allow-origin": options.postAllowOrigin };
  const reply = (payload: unknown, status = 200) => new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status, headers });
  if (body.method === "eth_blockNumber") return reply({ jsonrpc: "2.0", id: body.id, result: `0x${(options.head ?? HEAD).toString(16)}` });
  const logs = options.logsCap !== undefined && logsSpan(body) <= options.logsCap ? "ok" : (options.logs ?? "ok");
  if (logs === "ok") return reply({ jsonrpc: "2.0", id: body.id, result: [] });
  if ("error" in logs) return reply({ jsonrpc: "2.0", id: body.id, error: logs.error });
  return reply(logs.body ?? "", logs.status);
}

/** A fake JSON-RPC node behind a `FetchLike`, recording what it was asked. */
function fakeNode(options: NodeOptions = {}): { fetchFn: FetchLike; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const fetchFn: FetchLike = (_url, init) => {
    if (options.failWith !== undefined) return Promise.reject(options.failWith);
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as RpcBody) : undefined;
    requests.push({
      method: init.method ?? "GET",
      origin: headers.Origin,
      rpcMethod: body?.method,
      params: body?.params ?? [],
      requestHeaders: headers["Access-Control-Request-Headers"],
      redirect: init.redirect,
    });
    if (init.method === "OPTIONS") return Promise.resolve(preflightAnswer(options, init));
    if (options.postRedirect === true && !followsRedirects(init)) return Promise.resolve(moved());
    if (body === undefined) return Promise.resolve(new Response("", { status: 400 }));
    return Promise.resolve(rpcAnswer(options, body));
  };
  return { fetchFn, requests };
}

const SETTINGS = { timeoutMs: 1000 };

describe("C10: eth_getLogs over at least 10,000 blocks", () => {
  it("C10: asks for a range of at least 10,000 blocks ending at the head it recorded", async () => {
    const { fetchFn, requests } = fakeNode();
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    const call = requests.find((request) => request.rpcMethod === "eth_getLogs");
    const filter = call?.params[0] as { fromBlock: string; toBlock: string };
    const from = Number(BigInt(filter.fromBlock));
    const to = Number(BigInt(filter.toBlock));
    expect(to).toBe(HEAD);
    expect(to - from + 1).toBeGreaterThanOrEqual(10_000);
    expect(report.logs).toEqual({ status: "ok", fromBlock: from, toBlock: to, count: 0 });
    expect(report.head).toBe(HEAD);
  });

  it("C10: starts at block 0 on a chain younger than 10,000 blocks", async () => {
    const { fetchFn, requests } = fakeNode({ head: 500 });
    await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    const filter = requests.find((request) => request.rpcMethod === "eth_getLogs")?.params[0] as { fromBlock: string };
    expect(filter.fromBlock).toBe("0x0");
  });

  it.each([
    ["a -32005 range refusal", { error: { code: -32005, message: "query returned more than 10000 results" } }],
    ["a range message under -32000", { error: { code: -32000, message: "eth_getLogs is limited to a 10,000 range" } }],
    ["an Alchemy-style -32600 refusal", { error: { code: -32600, message: "Log response size exceeded" } }],
    ["HTTP 413", { status: 413, body: "payload too large" }],
  ] as const)("C10: reports %s as capped, not as a failure, when the smallest scan window is answered", async (_name, logs) => {
    const { fetchFn } = fakeNode({ logs, logsCap: 1000, postAllowOrigin: "*" });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(report.logs.status).toBe("capped");
    expect(isFailure({ chainId: 1, endpoints: [{ roles: ["read"], outcome: report }] })).toBe(false);
  });

  it("C10: asks a capped endpoint for exactly the smallest window of the chunked scans, ending at the head", async () => {
    const { fetchFn, requests } = fakeNode({ logs: { error: { code: -32005, message: "query returned more than 10000 results" } }, logsCap: MIN_WINDOW_BLOCKS });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    const ranges = requests
      .filter((request) => request.rpcMethod === "eth_getLogs")
      .map((request) => request.params[0] as { fromBlock: string; toBlock: string })
      .map((filter) => [Number(BigInt(filter.fromBlock)), Number(BigInt(filter.toBlock))]);
    expect(ranges).toEqual([
      [HEAD - 10_000, HEAD],
      [HEAD - MIN_WINDOW_BLOCKS + 1, HEAD],
    ]);
    expect(report.logs.status).toBe("capped");
  });

  it("C10: the smallest window it asks for is the smallest window getLogsChunked shrinks to", async () => {
    const { client, requests } = fakeLogsClient(() => Promise.resolve(rangeRefusal()));
    const event = parseAbiItem("event Ruling(address indexed _arbitrator, uint256 indexed _disputeID, uint256 _ruling)");
    const scan = getLogsChunked(client, { address: "0x0000000000000000000000000000000000000001", event, fromBlock: 0n, toBlock: 99_999n });
    await expect(scan).rejects.toThrow();
    const spans = requests.map((request) => Number(request.toBlock - request.fromBlock + 1n));
    expect(Math.min(...spans)).toBe(MIN_WINDOW_BLOCKS);
  });

  it.each([
    ["an Alchemy free-tier 10-block cap", { error: { code: -32600, message: "Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range." } }, 10],
    ["a -32602 refusal of every range", { error: { code: -32602, message: "invalid argument 0: json: cannot unmarshal" } }, undefined],
    ["HTTP 413 at every range", { status: 413, body: "payload too large" }, undefined],
  ] as const)("C10: fails on %s, which refuses the smallest window of the chunked scans too", async (_name, logs, logsCap) => {
    const { fetchFn } = fakeNode({ logs, logsCap, postAllowOrigin: "*" });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(report.logs).toMatchObject({ status: "failed", fromBlock: HEAD - MIN_WINDOW_BLOCKS + 1, toBlock: HEAD });
    expect(report.logs.status === "failed" ? report.logs.reason : "").toMatch(/100-block window of the chunked scans failed too/);
    expect(isFailure({ chainId: 1, endpoints: [{ roles: ["read"], outcome: report }] })).toBe(true);
  });

  it.each([
    ["an unrelated JSON-RPC error", { error: { code: -32000, message: "header not found" } }],
    ["HTTP 429", { status: 429, body: "Too Many Requests" }],
    [
      "HTTP 429 with Infura's JSON-RPC -32005 rate-limit body",
      { status: 429, body: JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32005, message: "project ID request rate exceeded" } }) },
    ],
    ["HTTP 500", { status: 500, body: "" }],
    ["a body that is not JSON", { status: 200, body: "<html>" }],
  ] as const)("C10: fails on %s", async (_name, logs) => {
    const { fetchFn } = fakeNode({ logs, logsCap: 1000 });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(report.logs.status).toBe("failed");
    expect(isFailure({ chainId: 1, endpoints: [{ roles: ["read"], outcome: report }] })).toBe(true);
  });

  it("C10: reports HTTP 429 as rate limiting even when its JSON-RPC body carries a range-cap code", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32005, message: "project ID request rate exceeded" } });
    const { fetchFn } = fakeNode({ logs: { status: 429, body }, logsCap: 1000 });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(report.logs).toMatchObject({ status: "failed", reason: "HTTP 429 (rate limited): JSON-RPC error -32005: project ID request rate exceeded" });
  });

  it("C10: fails, without asking for logs, when the head cannot be read", async () => {
    const { fetchFn, requests } = fakeNode({ failWith: Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }) });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(report.logs).toEqual({ status: "failed", reason: "block number unavailable: connection failed (ECONNREFUSED)" });
    expect(requests).toEqual([]);
  });
});

describe("C10: Origin: null", () => {
  it("C10: sends Origin: null on the preflight and on the request, and asks to send content-type", async () => {
    const { fetchFn, requests } = fakeNode({ postAllowOrigin: "*" });
    await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    const preflight = requests.find((request) => request.method === "OPTIONS");
    expect(preflight?.origin).toBe("null");
    expect(preflight?.requestHeaders).toBe("content-type");
    const posts = requests.filter((request) => request.method === "POST" && request.origin === "null");
    expect(posts.length).toBeGreaterThanOrEqual(1);
  });

  it.each(["*", "null"])("C10: accepts Access-Control-Allow-Origin: %s", async (allowed) => {
    const { fetchFn } = fakeNode({ postAllowOrigin: allowed, preflight: { headers: { ...ALLOW_ALL, "access-control-allow-origin": allowed } } });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(report.cors).toEqual({ status: "ok" });
  });

  it("C10: accepts Content-Type listed among several allowed headers in any case", async () => {
    const { fetchFn } = fakeNode({ postAllowOrigin: "*", preflight: { headers: { ...ALLOW_ALL, "access-control-allow-headers": "Authorization, Content-Type" } } });
    expect((await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS)).cors).toEqual({ status: "ok" });
  });

  it("C10: fails when the answer carries no Access-Control-Allow-Origin", async () => {
    const { fetchFn } = fakeNode({ preflight: { headers: { "access-control-allow-headers": "content-type" } } });
    expect((await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS)).cors).toEqual({ status: "failed", reason: "preflight: no Access-Control-Allow-Origin" });
  });

  it("C10: fails when only another origin is allowed", async () => {
    const { fetchFn } = fakeNode({
      postAllowOrigin: "https://resolve.kleros.io",
      preflight: { headers: { ...ALLOW_ALL, "access-control-allow-origin": "https://resolve.kleros.io" } },
    });
    expect((await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS)).cors).toEqual({
      status: "failed",
      reason: "preflight: Access-Control-Allow-Origin allows neither null nor any origin",
    });
  });

  it("C10: fails when the preflight is refused", async () => {
    const { fetchFn } = fakeNode({ preflight: { status: 403 } });
    expect((await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS)).cors).toEqual({ status: "failed", reason: "preflight: HTTP 403" });
  });

  it("C10: fails when the preflight does not allow content-type", async () => {
    const { fetchFn } = fakeNode({ preflight: { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization" } } });
    expect((await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS)).cors).toEqual({
      status: "failed",
      reason: "preflight: Access-Control-Allow-Headers does not allow content-type",
    });
  });

  it("C10: never follows a redirect, as a browser never follows one for a CORS preflight", async () => {
    const { fetchFn, requests } = fakeNode({ postAllowOrigin: "*" });
    await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => request.redirect === "manual")).toBe(true);
  });

  it("C10: fails when the preflight is redirected, though the redirect target would allow Origin: null", async () => {
    const { fetchFn } = fakeNode({ postAllowOrigin: "*", preflight: { redirect: true } });
    expect((await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS)).cors).toEqual({ status: "failed", reason: "preflight: redirected" });
  });

  it("C10: fails when the request with Origin: null is redirected", async () => {
    const { fetchFn } = fakeNode({ postAllowOrigin: "*", postRedirect: true });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(report.cors).toEqual({ status: "failed", reason: "request: redirected" });
    expect(report.logs).toEqual({ status: "failed", reason: "block number unavailable: redirected" });
  });

  it("C10: fails when the actual answer lacks the allowance the preflight gave", async () => {
    const { fetchFn } = fakeNode({});
    expect((await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS)).cors).toEqual({ status: "failed", reason: "request: no Access-Control-Allow-Origin" });
  });
});

describe("C10: no URL or key in any output", () => {
  it("C10: redact removes the URL, its host, its path segments and its query values", () => {
    const text = `request to ${URL_WITH_KEY} failed: host eth-mainnet.example-provider.io rejected key 0123456789abcdef0123456789abcdef and secretvalue123`;
    const redacted = redact(text, [URL_WITH_KEY]);
    for (const secret of ["eth-mainnet.example-provider.io", "0123456789abcdef", "secretvalue123", "https://"]) expect(redacted).not.toContain(secret);
  });

  it("C10: redact removes any URL even when it is not the configured one", () => {
    expect(redact("see https://other.example/path?k=v for details", [])).toBe("see <url> for details");
  });

  it("C10: a provider error that echoes the URL and key is reported without them", async () => {
    const message = `invalid key in ${URL_WITH_KEY}`;
    const { fetchFn } = fakeNode({ logs: { error: { code: -32000, message } } });
    const report = await checkEndpoint(URL_WITH_KEY, fetchFn, SETTINGS);
    const line = formatChainReport({ chainId: 1, endpoints: [{ roles: ["read"], outcome: report }] }).join("\n");
    expect(report.logs.status).toBe("failed");
    expect(line).not.toMatch(/secretvalue123|0123456789abcdef|example-provider|https?:/);
    expect(line).toContain("-32000");
  });

  it("C10: a network failure is named by its code, never by its message", async () => {
    const { fetchFn } = fakeNode({
      failWith: Object.assign(new TypeError(`fetch failed for ${URL_WITH_KEY}`), { cause: { code: "ENOTFOUND", message: `getaddrinfo ENOTFOUND ${URL_WITH_KEY}` } }),
    });
    const report = await checkEndpoint(URL_WITH_KEY, fetchFn, SETTINGS);
    expect(JSON.stringify(report)).not.toMatch(/secretvalue123|example-provider/);
    expect(report.logs).toMatchObject({ status: "failed", reason: expect.stringContaining("ENOTFOUND") as string });
  });

  it("C10: a timeout is reported as a timeout", async () => {
    const { fetchFn } = fakeNode({ failWith: Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }) });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(report.logs).toEqual({ status: "failed", reason: "block number unavailable: timed out after 1000 ms" });
  });
});

describe("C10, checklist D: every chain, read and public RPC", () => {
  /** Every chain's read variable set to a distinct host, as an operator's .env would. */
  function fullEnv(extra: Env = {}): Env {
    const entries = Object.values(CHAINS).flatMap((chain) => (chain.readRpcEnv === undefined ? [] : [[chain.readRpcEnv, `https://read-${String(chain.id)}.invalid/key`] as const]));
    return { ...Object.fromEntries(entries), ...extra };
  }

  const routes = (hosts: Record<string, NodeOptions>): FetchLike => {
    const nodes = new Map<string, FetchLike>();
    return (url, init) => {
      const host = new URL(url).host;
      let node = nodes.get(host);
      if (node === undefined) {
        node = fakeNode({ postAllowOrigin: "*", ...hosts[host] }).fetchFn;
        nodes.set(host, node);
      }
      return node(url, init);
    };
  };

  it("C10: reports every chain of CHAINS", async () => {
    const reports = await runPreflight({ env: fullEnv(), fetchFn: routes({}) });
    expect(reports.map((report) => report.chainId)).toEqual(Object.values(CHAINS).map((chain) => chain.id));
  });

  it("C10: resolves with the read and public resolvers, so an identical URL is checked once for both roles", async () => {
    const reports = await runPreflight({ env: fullEnv(), fetchFn: routes({}) });
    const mainnet = reports.find((report) => report.chainId === 1);
    expect(mainnet?.endpoints.map((endpoint) => endpoint.roles)).toEqual([["read", "public"]]);
  });

  it("C10, D-35: checks a distinct public RPC separately from the read RPC", async () => {
    const env = fullEnv({ REACT_APP_PUBLIC_RPC_1: "https://public-1.invalid/key" });
    const reports = await runPreflight({ env, fetchFn: routes({ "public-1.invalid": { preflight: { status: 403 } } }) });
    const mainnet = reports.find((report) => report.chainId === 1);
    expect(mainnet?.endpoints.map((endpoint) => endpoint.roles)).toEqual([["read"], ["public"]]);
    expect(isFailure(mainnet ?? { chainId: 1, endpoints: [] })).toBe(true);
    expect(isFailure(reports.find((report) => report.chainId === 100) ?? { chainId: 100, endpoints: [] })).toBe(false);
  });

  it("D-56: a chain with no read RPC fails, and its public setting does not stand in for it", async () => {
    const env = { ...fullEnv({ REACT_APP_PUBLIC_RPC_100: "https://public-100.invalid/key" }), REACT_APP_WEB3_XDAI_PROVIDER_URL: undefined };
    const reports = await runPreflight({ env, fetchFn: routes({}) });
    const gnosis = reports.find((report) => report.chainId === 100);
    expect(gnosis?.endpoints.map((endpoint) => [endpoint.roles, endpoint.outcome === "unconfigured"])).toEqual([
      [["read"], true],
      [["public"], false],
    ]);
    expect(isFailure(gnosis ?? { chainId: 100, endpoints: [] })).toBe(true);
    expect(formatChainReport(gnosis ?? { chainId: 100, endpoints: [] })[0]).toBe("chain 100 read: FAILED, no read RPC is configured");
  });

  it("C10: formats a chain without any URL", async () => {
    const reports = await runPreflight({ env: fullEnv(), fetchFn: routes({ "read-1.invalid": { logs: { error: { code: -32005, message: "limit exceeded" } }, logsCap: 1000 } }) });
    const lines = reports.flatMap(formatChainReport);
    expect(lines.join("\n")).not.toMatch(/invalid|https?:/);
    expect(lines[0]).toMatch(/^chain 1 read\+public: head \d+; eth_getLogs \d+-\d+ capped/);
  });

  it("C10: summarizes failures and capped endpoints for the exit code", async () => {
    const env = fullEnv();
    const ok = await runPreflight({ env, fetchFn: routes({ "read-1.invalid": { logs: { error: { code: -32005, message: "limit exceeded" } }, logsCap: 1000 } }) });
    expect(summarize(ok)).toEqual({ failed: 0, capped: 1, endpoints: Object.keys(CHAINS).length });
    const broken = await runPreflight({ env, fetchFn: routes({ "read-100.invalid": { postAllowOrigin: "https://elsewhere.org" } }) });
    expect(summarize(broken).failed).toBe(1);
  });
});
