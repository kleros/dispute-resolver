import { HttpRequestError, InvalidInputRpcError, LimitExceededRpcError, RpcRequestError, TimeoutError } from "viem";
import { describe, expect, it } from "vitest";
import { isRangeLimitError, LookupLimitError } from "./index";

const URL = "https://rpc.example/mainnet";

/** The error viem's transport throws for a JSON-RPC error response, before `buildRequest` maps it by code. */
function rpcRequestError(code: number, message: string, params: unknown = []): RpcRequestError {
  return new RpcRequestError({ body: { method: "eth_getLogs", params }, error: { code, message }, url: URL });
}

describe("isRangeLimitError (ported from reality-question.test.js)", () => {
  it.each([
    [{ code: -32005, message: "query returned more than 10000 results" }, true],
    [{ code: -32602, message: "Log response size exceeded." }, true],
    [{ message: "Returned error: block range is too wide" }, true],
    [{ message: "eth_getLogs is limited to a 1000 range" }, true],
    [{ message: 'Invalid JSON RPC response: "413 Request Entity Too Large"' }, true],
    [{ message: "CONNECTION TIMEOUT: timeout of 20000 ms achived" }, true],
    [{ code: -32005, message: "daily request count exceeded, request rate limited" }, false],
    [{ code: 429, message: "Too Many Requests" }, false],
    [{ code: -32000, message: "header not found" }, false],
  ])("§9.1: %j -> %s", (error, expected) => {
    expect(isRangeLimitError(error)).toBe(expected);
  });

  it("§9.1: a LookupLimitError is never a range error, despite its wording", () => {
    expect(isRangeLimitError(new LookupLimitError("Request budget of 1500 requests exceeded."))).toBe(false);
  });

  it("§9.1: the remaining range codes count without range wording", () => {
    expect(isRangeLimitError({ code: -32600, message: "invalid request" })).toBe(true);
    expect(isRangeLimitError({ code: -32614, message: "eth_getLogs failed" })).toBe(true);
    expect(isRangeLimitError({ code: 413, message: "payload" })).toBe(true);
    expect(isRangeLimitError({ code: "-32005", message: "error" })).toBe(true);
  });

  it("§9.1: plain strings and empty values are classified by wording", () => {
    expect(isRangeLimitError("block range too large")).toBe(true);
    expect(isRangeLimitError("execution reverted")).toBe(false);
    expect(isRangeLimitError(undefined)).toBe(false);
    expect(isRangeLimitError(null)).toBe(false);
  });
});

describe("isRangeLimitError on viem errors", () => {
  it("§6.3: a -32005 range refusal mapped by viem is a range error", () => {
    expect(isRangeLimitError(new LimitExceededRpcError(rpcRequestError(-32005, "query returned more than 10000 results")))).toBe(true);
  });

  it("§6.3: a -32005 rate limit mapped by viem is not a range error", () => {
    expect(isRangeLimitError(new LimitExceededRpcError(rpcRequestError(-32005, "daily request count exceeded, request rate limited")))).toBe(false);
  });

  it("§6.3: the request body is not read, so a topic containing 10000 does not look like a range error", () => {
    const params = [{ topics: ["0x0000000000000000000000000000000000000000000000000000000000010000"], fromBlock: "0x10000", toBlock: "0x20000" }];
    const error = new InvalidInputRpcError(rpcRequestError(-32000, "header not found", params));
    expect(error.message).toContain("10000");
    expect(isRangeLimitError(error)).toBe(false);
  });

  it("§6.3: a request timeout is a range error (too heavy to answer in time)", () => {
    expect(isRangeLimitError(new TimeoutError({ body: { method: "eth_getLogs" }, url: URL }))).toBe(true);
  });

  it("§6.3: HTTP 413 is a range error and HTTP 429 is not", () => {
    expect(isRangeLimitError(new HttpRequestError({ status: 413, details: "Payload Too Large", url: URL }))).toBe(true);
    expect(isRangeLimitError(new HttpRequestError({ status: 429, details: "Too Many Requests", url: URL }))).toBe(false);
  });

  it("§6.3: a server error without range wording is not a range error", () => {
    expect(isRangeLimitError(new HttpRequestError({ status: 500, details: "Internal Server Error", url: URL }))).toBe(false);
  });

  it("§9.1: a LookupLimitError wrapped as a cause is never a range error", () => {
    expect(isRangeLimitError(new Error("wrapped", { cause: new LookupLimitError("Request budget of 1500 requests exceeded.") }))).toBe(false);
  });
});
