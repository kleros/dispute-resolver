import { ContractFunctionExecutionError, HttpRequestError, parseAbi, RpcRequestError, TimeoutError } from "viem";
import { describe, expect, it } from "vitest";
import { failureMessage, redact } from "./failureMessage";

const KEY = "abc123SECRETxyz";
const KEYED_URL = `https://rpc.example/v2/${KEY}`;
const BODY = { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] };
const URL_WITH_KEY = "https://eth-mainnet.example-provider.io/v3/0123456789abcdef0123456789abcdef?apikey=secretvalue123";

function expectNoUrlOrKey(text: string): void {
  for (const secret of [KEYED_URL, KEY, "rpc.example", "://"]) expect(text).not.toContain(secret);
}

describe("failureMessage", () => {
  it("reports a viem HTTP error by its short message, without the keyed URL viem puts in its full message", () => {
    const error = new HttpRequestError({ url: KEYED_URL, status: 401, body: BODY, details: `unauthorized: ${KEYED_URL}` });
    expect(error.message).toContain(KEY);
    const text = failureMessage(error, {});
    expectNoUrlOrKey(text);
    expect(text).toBe("HTTP request failed.");
  });

  it("reports a viem timeout by its short message, without the keyed URL", () => {
    const error = new TimeoutError({ url: KEYED_URL, body: BODY });
    expect(error.message).toContain(KEY);
    const text = failureMessage(error, {});
    expectNoUrlOrKey(text);
    expect(text).toBe("The request took too long to respond.");
  });

  it("reports a failed contract read by its cause's short message, without the keyed URL viem repeats from it", () => {
    const cause = new HttpRequestError({ url: KEYED_URL, status: 503, body: BODY });
    const error = new ContractFunctionExecutionError(cause, { abi: parseAbi(["function denominator() view returns (uint256)"]), functionName: "denominator" });
    expect(error.message).toContain(KEY);
    const text = failureMessage(error, {});
    expectNoUrlOrKey(text);
    expect(text).toBe("HTTP request failed.");
  });

  it("reports a viem JSON-RPC error without the node's message or the keyed URL", () => {
    const error = new RpcRequestError({ url: KEYED_URL, body: BODY, error: { code: -32_000, message: `invalid key ${KEY}` } });
    const text = failureMessage(error, {});
    expectNoUrlOrKey(text);
    expect(text).toBe("RPC Request failed.");
  });

  it("removes the URL and key of a viem message that another error copied into its own", () => {
    const viemError = new HttpRequestError({ url: KEYED_URL, status: 500, body: BODY });
    const text = failureMessage(new Error(`eth_getLogs on chain 1 failed: ${viemError.message}`), {});
    expectNoUrlOrKey(text);
    expect(text).toContain("eth_getLogs on chain 1 failed: HTTP request failed.");
  });

  it("removes the configured RPC's key when a node echoes it without the URL", () => {
    const env = { REACT_APP_WEB3_PROVIDER_URL: KEYED_URL };
    const text = failureMessage(new Error(`eth_call on chain 1: invalid key ${KEY} for rpc.example`), env);
    expectNoUrlOrKey(text);
    expect(text).toContain("eth_call on chain 1: invalid key");
  });

  it("removes the key of a configured public RPC too", () => {
    const env = { REACT_APP_PUBLIC_RPC_100: KEYED_URL };
    expectNoUrlOrKey(failureMessage(new Error(`rejected ${KEY}`), env));
  });

  it("leaves no part of a key behind when another configured piece is a prefix of it", () => {
    const env = { REACT_APP_WEB3_PROVIDER_URL: "https://short.example/v2/abc123SECR", REACT_APP_PUBLIC_RPC_1: KEYED_URL };
    const text = failureMessage(new Error(`rejected ${KEY}`), env);
    expect(text).toBe("rejected <redacted>");
  });

  it("keeps a plain error's message whole, addresses and variable names included", () => {
    const message = "Chain 1 has no read RPC configured (REACT_APP_WEB3_PROVIDER_URL); 0xc7add3c961f7935cb4914e37da991d2f1cd7986c: 2 Dispute logs.";
    expect(failureMessage(new Error(message), { REACT_APP_WEB3_PROVIDER_URL: KEYED_URL })).toBe(message);
  });

  it("puts a message that spans lines or carries terminal escapes on one line", () => {
    expect(failureMessage(new Error("first\nforged line\r\n\u001b[31mred"), {})).toBe("first forged line [31mred");
  });

  it("names a thrown value that is not an error without quoting it", () => {
    expect(failureMessage(KEYED_URL, {})).toBe("The run failed.");
    expect(failureMessage(undefined, {})).toBe("The run failed.");
  });
});

describe("redact", () => {
  it("removes the URL, its host, its path segments and its query values", () => {
    const text = `request to ${URL_WITH_KEY} failed: host eth-mainnet.example-provider.io rejected key 0123456789abcdef0123456789abcdef and secretvalue123`;
    const redacted = redact(text, [URL_WITH_KEY]);
    for (const secret of ["eth-mainnet.example-provider.io", "0123456789abcdef", "secretvalue123", "https://"]) expect(redacted).not.toContain(secret);
  });

  it("removes any URL even when it is not the configured one", () => {
    expect(redact("see https://other.example/path?k=v for details", [])).toBe("see <url> for details");
  });

  it("removes any long token, a key a provider echoes without its URL", () => {
    expect(redact("unknown key 9f8e7d6c5b4a39281706f5e4", [])).toBe("unknown key <redacted>");
  });
});
