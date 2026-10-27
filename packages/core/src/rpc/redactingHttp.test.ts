import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InvalidInputRpcError,
  RpcRequestError,
  TimeoutError,
  createPublicClient,
  encodeErrorResult,
  parseAbi,
} from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubEndpoint } from "../test/rpc/testHelpers";
import { isContractFailure } from "./failures";
import { isRangeLimitError } from "./rangeLimit";
import { redactingHttp } from "./redactingHttp";

const KEY = "abc123SECRETxyz";
const KEYED_URL = `https://rpc.example/v2/${KEY}`;
const HEX_KEY = "d4e8a1c97b3f4e20a6c5b19e0f7d2a83";
const HEX_KEY_URL = `https://rpc.example/v3/${HEX_KEY}`;
const ORIGIN = "https://rpc.example";
const ARBITRATOR = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";

/**
 * Every string a console could print of an error: its text and every own property, enumerable or not, name and value,
 * of it, of its causes and of everything they hold, however deep, with the names and values of any headers among them.
 */
function texts(error: unknown): string[] {
  const found: string[] = [String(error)];
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") found.push(value);
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (value instanceof Headers) value.forEach((text, name) => found.push(name, text));
    for (const name of Object.getOwnPropertyNames(value)) {
      found.push(name);
      visit(Reflect.get(value, name));
    }
  };
  visit(error);
  return found;
}

/**
 * Six characters in a row of `key`, in any letter case: what a parse error quoting the start of an answer, or a header
 * name, which is lowercased, can leave of it.
 */
function keyWindows(key: string): string[] {
  return Array.from({ length: key.length - 5 }, (_, start) => key.slice(start, start + 6).toLowerCase());
}

function expectNoKey(error: unknown, key = KEY): void {
  const windows = keyWindows(key);
  for (const text of texts(error)) {
    const lowered = text.toLowerCase();
    for (const piece of windows) expect(lowered).not.toContain(piece);
    expect(text).not.toContain("/v2/");
  }
}

/** Replaces the global fetch with an RPC that answers every request with `body`. */
function stubAnswer(body: string, init: ResponseInit): void {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(body, init)));
}

async function failedRequest(url: string, method = "eth_blockNumber", timeout?: number): Promise<unknown> {
  const transport = redactingHttp(url, { retryCount: 0, ...(timeout === undefined ? {} : { timeout }) })({});
  try {
    await transport.request({ method });
  } catch (error) {
    return error;
  }
  throw new Error("expected the request to fail");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("redactingHttp", () => {
  it("sends every request to the full configured URL and returns the node's answer", async () => {
    const endpoint = stubEndpoint(() => ({ result: "0x10" }));
    const transport = redactingHttp(KEYED_URL)({});
    expect(await transport.request({ method: "eth_blockNumber" })).toBe("0x10");
    expect(endpoint.posts.map((post) => post.url)).toEqual([KEYED_URL]);
  });

  it("stays an http transport for wagmi and AppKit", () => {
    expect(redactingHttp(KEYED_URL)({}).config.type).toBe("http");
  });

  it("a node error names the RPC by its origin only and keeps its class and code", async () => {
    stubEndpoint(() => ({ error: { code: -32000, message: "header not found" } }));
    const error = await failedRequest(KEYED_URL);
    expect(error).toBeInstanceOf(InvalidInputRpcError);
    expect(error).toMatchObject({ code: -32000, details: "header not found" });
    const request = (error as BaseError).walk((cause) => cause instanceof RpcRequestError);
    expect(request).toBeInstanceOf(RpcRequestError);
    expect((request as RpcRequestError).url).toBe(ORIGIN);
    expect((error as BaseError).message).toContain(`URL: ${ORIGIN}`);
    expectNoKey(error);
  });

  it("an HTTP failure keeps its status and names the RPC by its origin only", async () => {
    stubEndpoint(() => ({ status: 401 }));
    const error = await failedRequest(KEYED_URL);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({ status: 401, url: ORIGIN });
    expectNoKey(error);
  });

  it("a timeout names the RPC by its origin only and still reads as a range limit", async () => {
    stubEndpoint(() => "hang");
    const error = await failedRequest(KEYED_URL, "eth_getLogs", 20);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(isRangeLimitError(error)).toBe(true);
    expectNoKey(error);
  });

  it("a network failure whose own message quotes the URL is redacted too", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError(`request to ${KEYED_URL} failed, reason: connect ECONNREFUSED`)));
    const error = await failedRequest(KEYED_URL);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect((error as HttpRequestError).details).toBe(`request to ${ORIGIN} failed, reason: connect ECONNREFUSED`);
    expectNoKey(error);
  });

  it("a URL with credentials is redacted in the spelling viem prints, without them", async () => {
    stubEndpoint(() => ({ status: 500 }));
    const error = await failedRequest(`https://user:pass@rpc.example/v2/${KEY}`);
    expect(error).toMatchObject({ status: 500, url: ORIGIN });
    expectNoKey(error);
    for (const text of texts(error)) expect(text).not.toContain("pass@");
  });

  it.each([
    ["its path", KEYED_URL],
    ["its query", `https://rpc.example/?apikey=${KEY}`],
    ["its credentials", `https://user:${KEY}@rpc.example/`],
  ])("an HTTP failure whose answer repeats the key in %s, without the URL, never carries it", async (_, url) => {
    stubAnswer(`invalid API key ${KEY}`, { status: 401, headers: { "Content-Type": "text/plain" } });
    const error = await failedRequest(url);
    expect(error).toMatchObject({ status: 401, url: ORIGIN });
    expect((error as HttpRequestError).details).toContain("invalid API key");
    expectNoKey(error);
  });

  it("a node error whose message repeats the key never carries it", async () => {
    stubEndpoint(() => ({ error: { code: -32000, message: `key ${KEY} over quota` } }));
    const error = await failedRequest(KEYED_URL);
    expect(error).toMatchObject({ code: -32000 });
    expect((error as BaseError).details).toContain("over quota");
    expectNoKey(error);
  });

  it("an answer that is not JSON reports that, without the start of the answer its parse error quotes", async () => {
    stubAnswer(`{"error": ${KEY}}`, { status: 200, headers: { "Content-Type": "text/plain" } });
    const error = await failedRequest(KEYED_URL);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect((error as HttpRequestError).details).toBe("The RPC's answer is not JSON.");
    expect((error as HttpRequestError).message).toContain("Details: The RPC's answer is not JSON.");
    expectNoKey(error);
  });

  it("short pieces of the URL stay readable in the error", async () => {
    stubAnswer("route v2 is closed", { status: 404, headers: { "Content-Type": "text/plain" } });
    const error = await failedRequest(KEYED_URL);
    expect((error as HttpRequestError).details).toBe(JSON.stringify("route v2 is closed"));
  });

  it("a node error whose data repeats the URL or the key never carries them, and keeps its code and classification", async () => {
    const data = { see: KEYED_URL, reason: `key ${KEY} over quota`, tried: [KEY, { key: KEY }] };
    stubEndpoint(() => ({ error: { code: -32005, message: "daily request count exceeded", data } }));
    const error = await failedRequest(KEYED_URL, "eth_getLogs");
    expect(error).toMatchObject({ code: -32005 });
    expect(isRangeLimitError(error)).toBe(false);
    const request = (error as BaseError).walk((cause) => cause instanceof RpcRequestError);
    expect((request as RpcRequestError).data).toEqual({ see: ORIGIN, reason: "key <redacted> over quota", tried: ["<redacted>", { key: "<redacted>" }] });
    expectNoKey(error);
  });

  it("a node error whose data nests the key deeper than is worth walking drops that part", async () => {
    const deep = Array.from({ length: 30 }).reduce<unknown>((inner) => ({ inner }), `key ${KEY}`);
    stubEndpoint(() => ({ error: { code: -32000, message: "unauthorized", data: deep } }));
    const error = await failedRequest(KEYED_URL);
    expect(error).toMatchObject({ code: -32000 });
    const request = (error as BaseError).walk((cause) => cause instanceof RpcRequestError);
    expect(JSON.stringify((request as RpcRequestError).data)).toContain("<redacted>");
    expectNoKey(error);
  });

  it("an error whose data refers back to itself is redacted once and still thrown", async () => {
    const data: Record<string, unknown> = { reason: `key ${KEY} rejected` };
    data.self = data;
    vi.stubGlobal("fetch", () => Promise.reject(Object.assign(new TypeError("fetch failed"), { data })));
    const error = await failedRequest(KEYED_URL);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(data).toEqual({ reason: "key <redacted> rejected", self: data });
    expectNoKey(error);
  });

  it("revert data stays whole for viem to decode when the URL's key is hex too", async () => {
    const abi = parseAbi(["function denominator() view returns (uint256)", "error Rejected(bytes16 code)"]);
    const revert = encodeErrorResult({ abi, errorName: "Rejected", args: [`0x${"2A".repeat(16)}`] });
    stubEndpoint(() => ({ error: { code: 3, message: "execution reverted", data: revert } }));

    const request = (await failedRequest(HEX_KEY_URL, "eth_call")) as BaseError;
    const requestError = request.walk((cause) => cause instanceof RpcRequestError) as RpcRequestError;
    expect(requestError.data).toBe(revert);
    expect(requestError.url).toBe(ORIGIN);
    expectNoKey(request, HEX_KEY);

    const client = createPublicClient({ transport: redactingHttp(HEX_KEY_URL, { retryCount: 0 }) });
    const error: unknown = await client.readContract({ address: ARBITRATOR, abi, functionName: "denominator" }).catch((caught: unknown) => caught);
    const reverted = (error as BaseError).walk((cause) => cause instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError;
    expect(reverted).toBeInstanceOf(ContractFunctionRevertedError);
    expect(reverted.raw).toBe(revert);
    expect(reverted.data?.errorName).toBe("Rejected");
    expect(isContractFailure(error)).toBe(true);
    expectNoKey(error, HEX_KEY);
  });

  it.each<[string, string, string, unknown, unknown]>([
    ["holds the URL's hex key as hex written as the URL writes it", HEX_KEY_URL, HEX_KEY, `0x${HEX_KEY}`, "0x<redacted>"],
    ["holds the URL's hex key as hex in capitals", HEX_KEY_URL, HEX_KEY, `0x${HEX_KEY.toUpperCase()}`, "0x<redacted>"],
    ["holds the URL's hex key as hex in lower case when the URL writes it in capitals", `https://rpc.example/v3/${HEX_KEY.toUpperCase()}`, HEX_KEY, `0x${HEX_KEY}`, "0x<redacted>"],
    ["holds the URL's hex key inside longer hex", HEX_KEY_URL, HEX_KEY, `0x${"00".repeat(16)}${HEX_KEY.toUpperCase()}`, `0x${"00".repeat(16)}<redacted>`],
    ["holds the URL's hex key as a property name in capitals", HEX_KEY_URL, HEX_KEY, { [`0x${HEX_KEY.toUpperCase()}`]: true }, { "0x<redacted>": true }],
    ["is a sentence repeating the key", KEYED_URL, KEY, `invalid API key ${KEY}`, "invalid API key <redacted>"],
    [
      "names properties after the URL or the key",
      KEYED_URL,
      KEY,
      { [KEYED_URL]: "rejected", [`key ${KEY}`]: { [KEY]: 1 }, tried: [{ [KEY]: true }], code: "kept" },
      { [ORIGIN]: "rejected", "key <redacted>": { "<redacted>": 1 }, tried: [{ "<redacted>": true }], code: "kept" },
    ],
  ])("a node error whose data %s never carries the key", async (_, url, key, data, redacted) => {
    stubEndpoint(() => ({ error: { code: -32000, message: "unauthorized", data } }));
    const error = await failedRequest(url);
    expect(error).toMatchObject({ code: -32000 });
    const request = (error as BaseError).walk((cause) => cause instanceof RpcRequestError);
    expect((request as RpcRequestError).data).toEqual(redacted);
    expectNoKey(error, key);
  });

  it("a node's own error object with a property named after the key never carries it", async () => {
    const nodeError = { code: -32000, message: "unauthorized", [KEY]: "rejected" };
    stubEndpoint(() => ({ error: nodeError }));
    const error = await failedRequest(KEYED_URL);
    expect(error).toMatchObject({ code: -32000 });
    const request = (error as BaseError).walk((cause) => cause instanceof RpcRequestError);
    expect((request as RpcRequestError).cause).toEqual({ code: -32000, message: "unauthorized", "<redacted>": "rejected" });
    expectNoKey(error);
  });

  it("an HTTP failure whose response headers name the keyed URL or the key never carries them, and keeps the rest", async () => {
    stubAnswer("unauthorized", {
      status: 401,
      headers: { "Content-Type": "text/plain", "Content-Location": KEYED_URL, "X-Reason": `key ${KEY} rejected`, [`X-Key-${KEY}`]: "rejected" },
    });
    const error = await failedRequest(KEYED_URL);
    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({ status: 401, url: ORIGIN });
    const { headers } = error as HttpRequestError;
    expect(headers).toBeInstanceOf(Headers);
    expect(headers?.get("Content-Type")).toBe("text/plain");
    expect(headers?.get("Content-Location")).toBe(ORIGIN);
    expect(headers?.get("X-Reason")).toBe("key <redacted> rejected");
    expect(headers?.get("X-Key-redacted")).toBe("rejected");
    expectNoKey(error);
  });

  it("a balance read refused with headers naming the keyed URL never carries the key in the error a wallet library logs", async () => {
    stubAnswer("unauthorized", { status: 401, headers: { "Content-Type": "text/plain", "Content-Location": KEYED_URL } });
    const client = createPublicClient({ transport: redactingHttp(KEYED_URL, { retryCount: 0 }) });
    const error: unknown = await client.getBalance({ address: ARBITRATOR }).catch((caught: unknown) => caught);
    expect((error as BaseError).walk((cause) => cause instanceof HttpRequestError)).toMatchObject({ status: 401, url: ORIGIN });
    expectNoKey(error);
  });

  it("headers on any error in the chain are redacted too", async () => {
    const headers = new Headers({ "Content-Location": KEYED_URL });
    vi.stubGlobal("fetch", () => Promise.reject(Object.assign(new TypeError("fetch failed"), { headers })));
    const error = await failedRequest(KEYED_URL);
    expect(error).toBeInstanceOf(HttpRequestError);
    const cause = (error as HttpRequestError).cause as TypeError & { headers: Headers };
    expect(cause).toBeInstanceOf(TypeError);
    expect(cause.headers.get("Content-Location")).toBe(ORIGIN);
    expectNoKey(error);
  });

  it("a revert a node reports as invalid input still decodes from the data of the request error viem wraps", async () => {
    const abi = parseAbi(["function denominator() view returns (uint256)"]);
    const revert = encodeErrorResult({ abi: parseAbi(["error Error(string)"]), errorName: "Error", args: ["nope"] });
    stubEndpoint(() => ({ error: { code: -32000, message: "execution reverted", data: revert } }));
    const client = createPublicClient({ transport: redactingHttp(KEYED_URL, { retryCount: 0 }) });
    const error: unknown = await client.readContract({ address: ARBITRATOR, abi, functionName: "denominator" }).catch((caught: unknown) => caught);
    const reverted = (error as BaseError).walk((cause) => cause instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError;
    expect(reverted).toBeInstanceOf(ContractFunctionRevertedError);
    expect(reverted.raw).toBe(revert);
    expect(reverted.reason).toBe("nope");
    expectNoKey(error);
  });
});
