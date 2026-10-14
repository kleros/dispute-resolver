import { describe, expect, it } from "vitest";
import { CHAINS } from "../src/chains";
import type { Env } from "../src/types";
import { checkEndpoint, formatChainReport, isFailure, redact, runPreflight, summarize, type FetchLike } from "./preflight-rpc";

const HEAD = 24_000_000;
const URL_WITH_KEY = "https://eth-mainnet.example-provider.io/v3/0123456789abcdef0123456789abcdef?apikey=secretvalue123";

interface NodeOptions {
  /** The answer to `eth_getLogs`: a result, a JSON-RPC error or an HTTP status with a body. */
  readonly logs?: { readonly error: { readonly code: number; readonly message: string } } | { readonly status: number; readonly body?: string } | "ok";
  /** The headers of the answer to the CORS preflight (`OPTIONS`); `status` defaults to 204. */
  readonly preflight?: { readonly status?: number; readonly headers?: Record<string, string> };
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
}

const ALLOW_ALL: Record<string, string> = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST" };

/** A fake JSON-RPC node behind a `FetchLike`, recording what it was asked. */
function fakeNode(options: NodeOptions = {}): { fetchFn: FetchLike; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const fetchFn: FetchLike = (_url, init) => {
    if (options.failWith !== undefined) return Promise.reject(options.failWith);
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as { method: string; params: unknown[]; id: number }) : undefined;
    requests.push({
      method: init.method ?? "GET",
      origin: headers.Origin,
      rpcMethod: body?.method,
      params: body?.params ?? [],
      requestHeaders: headers["Access-Control-Request-Headers"],
    });
    if (init.method === "OPTIONS") {
      const { status = 204, headers: preflightHeaders = ALLOW_ALL } = options.preflight ?? {};
      return Promise.resolve(new Response(null, { status, headers: preflightHeaders }));
    }
    const postHeaders: Record<string, string> = options.postAllowOrigin === undefined ? {} : { "access-control-allow-origin": options.postAllowOrigin };
    const reply = (payload: unknown, status = 200) =>
      Promise.resolve(new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status, headers: postHeaders }));
    if (body?.method === "eth_blockNumber") return reply({ jsonrpc: "2.0", id: body.id, result: `0x${(options.head ?? HEAD).toString(16)}` });
    const logs = options.logs ?? "ok";
    if (logs === "ok") return reply({ jsonrpc: "2.0", id: body?.id, result: [] });
    if ("error" in logs) return reply({ jsonrpc: "2.0", id: body?.id, error: logs.error });
    return reply(logs.body ?? "", logs.status);
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
  ] as const)("C10: reports %s as capped, not as a failure", async (_name, logs) => {
    const { fetchFn } = fakeNode({ logs, postAllowOrigin: "*" });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(report.logs.status).toBe("capped");
    expect(isFailure({ chainId: 1, endpoints: [{ roles: ["read"], outcome: report }] })).toBe(false);
  });

  it.each([
    ["an unrelated JSON-RPC error", { error: { code: -32000, message: "header not found" } }],
    ["HTTP 429", { status: 429, body: "Too Many Requests" }],
    ["HTTP 500", { status: 500, body: "" }],
    ["a body that is not JSON", { status: 200, body: "<html>" }],
  ] as const)("C10: fails on %s", async (_name, logs) => {
    const { fetchFn } = fakeNode({ logs });
    const report = await checkEndpoint("https://rpc.example/k", fetchFn, SETTINGS);
    expect(report.logs.status).toBe("failed");
    expect(isFailure({ chainId: 1, endpoints: [{ roles: ["read"], outcome: report }] })).toBe(true);
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
    const reports = await runPreflight({ env: fullEnv(), fetchFn: routes({ "read-1.invalid": { logs: { error: { code: -32005, message: "limit exceeded" } } } }) });
    const lines = reports.flatMap(formatChainReport);
    expect(lines.join("\n")).not.toMatch(/invalid|https?:/);
    expect(lines[0]).toMatch(/^chain 1 read\+public: head \d+; eth_getLogs \d+-\d+ capped/);
  });

  it("C10: summarizes failures and capped endpoints for the exit code", async () => {
    const env = fullEnv();
    const ok = await runPreflight({ env, fetchFn: routes({ "read-1.invalid": { logs: { error: { code: -32005, message: "limit exceeded" } } } }) });
    expect(summarize(ok)).toEqual({ failed: 0, capped: 1, endpoints: Object.keys(CHAINS).length });
    const broken = await runPreflight({ env, fetchFn: routes({ "read-100.invalid": { postAllowOrigin: "https://elsewhere.org" } }) });
    expect(summarize(broken).failed).toBe(1);
  });
});
