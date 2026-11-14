import { HttpRequestError, InvalidInputRpcError, InvalidParamsRpcError, LimitExceededRpcError, ResponseBodyTooLargeError, RpcRequestError, TimeoutError } from "viem";
import { describe, expect, it } from "vitest";
import refusal from "./__fixtures__/gnosis-crowded-logs-refusal.json";
import { isRangeLimitError, LookupLimitError } from "./index";
import { TooManyLogsError } from "./errors";
import { isTooManyResultsError } from "./rangeLimit";

const URL = "https://rpc.example/mainnet";

/** The error viem's transport throws for a JSON-RPC error response, before `buildRequest` maps it by code. */
function rpcRequestError(code: number, message: string, params: unknown = [], data?: unknown): RpcRequestError {
  return new RpcRequestError({ body: { method: "eth_getLogs", params }, error: { code, message, data }, url: URL });
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

describe("isTooManyResultsError", () => {
  it.each<[unknown, boolean]>([
    [refusal.error, true],
    [{ code: -32005, message: "query returned more than 10000 results" }, true],
    [{ code: -32005, message: "query returned more than 10,000 results. Try with this block range [0x1, 0x2]." }, true],
    [{ code: -32602, message: "Log response size exceeded. You can make eth_getLogs requests with up to a 2K block range and no limit on the response size." }, true],
    [{ code: -32602, message: "query exceeds max results 20000, retry with the range 100-200" }, true],
    [{ message: "too many results" }, true],
    [{ code: -32602, message: "invalid params" }, false],
    [{ message: "CONNECTION TIMEOUT: timeout of 20000 ms achived" }, false],
    [{ message: "request timed out" }, false],
    [{ code: -32005, message: "daily request count exceeded, request rate limited" }, false],
    [{ code: 429, message: "Too Many Requests" }, false],
    [{ message: "rate limit exceeded: more than 100 results per second" }, false],
    [{ message: "Returned error: block range is too wide" }, false],
    [{ message: "eth_getLogs is limited to a 1000 range" }, false],
    [{ code: -32602, message: "exceed maximum block range: 5000" }, false],
    [{ message: 'Invalid JSON RPC response: "413 Request Entity Too Large"' }, false],
    [{ code: -32005, message: "limit exceeded" }, false],
    [{ code: -32000, message: "header not found" }, false],
    [{ code: 3, message: "execution reverted", data: "0x08c379a0" }, false],
    [undefined, false],
  ])("classifies %j as too many results: %s", (error, expected) => {
    expect(isTooManyResultsError(error)).toBe(expected);
  });

  it.each<[string, Error, boolean]>([
    [
      "the recorded Gnosis refusal as viem's read transport throws it",
      new InvalidParamsRpcError(rpcRequestError(refusal.error.code, refusal.error.message, [], refusal.error.data)),
      true,
    ],
    ["a result-count refusal mapped by viem", new LimitExceededRpcError(rpcRequestError(-32005, "query returned more than 10000 results")), true],
    ["an answer larger than the read client accepts", new ResponseBodyTooLargeError({ maxSize: 10_485_760, size: 10_485_761 }), true],
    ["a request timeout", new TimeoutError({ body: { method: "eth_getLogs" }, url: URL }), false],
    ["HTTP 413", new HttpRequestError({ status: 413, details: "nginx", url: URL }), false],
    ["HTTP 429", new HttpRequestError({ status: 429, details: "Too Many Requests", url: URL }), false],
    ["the scan's own log cap", new TooManyLogsError(1_000), false],
    ["the scan's own log cap wrapped as a cause", new Error("wrapped", { cause: new TooManyLogsError(1_000) }), false],
    ["a spent request budget", new LookupLimitError("Request budget of 1500 requests exceeded."), false],
  ])("%s: %s", (_name, error, expected) => {
    expect(isTooManyResultsError(error)).toBe(expected);
  });

  it("the request body is not read, so blocks and topics in it never look like a result count", () => {
    const params = [{ topics: ["more than 10000 results"], fromBlock: "0x10000", toBlock: "0x20000" }];
    const error = new InvalidParamsRpcError(rpcRequestError(-32602, "invalid params", params));
    expect(error.message).toContain("more than 10000 results");
    expect(isTooManyResultsError(error)).toBe(false);
  });
});
