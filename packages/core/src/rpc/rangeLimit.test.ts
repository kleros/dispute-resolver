import { HttpRequestError, InvalidInputRpcError, LimitExceededRpcError, RpcRequestError, TimeoutError } from "viem";
import { describe, expect, it } from "vitest";
import { isRangeLimitError, LookupLimitError } from "./index";

const URL = "https://rpc.example/mainnet";

/** The error viem's transport throws for a JSON-RPC error response, before `buildRequest` maps it by code. */
function rpcRequestError(code: number, message: string, params: unknown = []): RpcRequestError {
  return new RpcRequestError({ body: { method: "eth_getLogs", params }, error: { code, message }, url: URL });
}

describe("isRangeLimitError on provider error shapes", () => {
  it.each<[unknown, boolean]>([
    [{ code: -32005, message: "query returned more than 10000 results" }, true],
    [{ code: -32602, message: "Log response size exceeded." }, true],
    [{ message: "Returned error: block range is too wide" }, true],
    [{ message: "eth_getLogs is limited to a 1000 range" }, true],
    [{ message: 'Invalid JSON RPC response: "413 Request Entity Too Large"' }, true],
    [{ message: "CONNECTION TIMEOUT: timeout of 20000 ms achived" }, true],
    [{ code: -32005, message: "daily request count exceeded, request rate limited" }, false],
    [{ code: 429, message: "Too Many Requests" }, false],
    [{ message: "rate limit exceeded" }, false],
    [{ message: "ratelimited" }, false],
    [{ code: -32000, message: "header not found" }, false],
    [{ code: -32600, message: "invalid request" }, true],
    [{ code: -32614, message: "eth_getLogs failed" }, true],
    [{ code: 413, message: "payload" }, true],
    [{ code: "-32005", message: "error" }, true],
    ["block range too large", true],
    ["execution reverted", false],
    [undefined, false],
    [null, false],
  ])("classifies %j as a range limit: %s", (error, expected) => {
    expect(isRangeLimitError(error)).toBe(expected);
  });

  it("a LookupLimitError is never a range error, despite its wording", () => {
    expect(isRangeLimitError(new LookupLimitError("Request budget of 1500 requests exceeded."))).toBe(false);
  });
});

describe("isRangeLimitError on viem errors", () => {
  it.each<[string, Error, boolean]>([
    ["a -32005 range refusal mapped by viem is a range error", new LimitExceededRpcError(rpcRequestError(-32005, "query returned more than 10000 results")), true],
    ["a -32005 rate limit mapped by viem is not a range error", new LimitExceededRpcError(rpcRequestError(-32005, "daily request count exceeded, request rate limited")), false],
    ["a request timeout is a range error (too heavy to answer in time)", new TimeoutError({ body: { method: "eth_getLogs" }, url: URL }), true],
    ["HTTP 413 is a range error", new HttpRequestError({ status: 413, details: "nginx", url: URL }), true],
    ["HTTP 429 is not a range error", new HttpRequestError({ status: 429, details: "Too Many Requests", url: URL }), false],
    ["a server error without range wording is not a range error", new HttpRequestError({ status: 500, details: "Internal Server Error", url: URL }), false],
    ["a LookupLimitError wrapped as a cause is never a range error", new Error("wrapped", { cause: new LookupLimitError("Request budget of 1500 requests exceeded.") }), false],
  ])("%s", (_name, error, expected) => {
    expect(isRangeLimitError(error)).toBe(expected);
  });

  it("the request body is not read, so a topic containing 10000 does not look like a range error", () => {
    const params = [{ topics: ["0x0000000000000000000000000000000000000000000000000000000000010000"], fromBlock: "0x10000", toBlock: "0x20000" }];
    const error = new InvalidInputRpcError(rpcRequestError(-32000, "header not found", params));
    expect(error.message).toContain("10000");
    expect(isRangeLimitError(error)).toBe(false);
  });
});
