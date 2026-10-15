import { HttpRequestError, RpcRequestError, TimeoutError } from "viem";
import { describe, expect, it } from "vitest";
import { describeFailure, httpGet, type HttpGet } from "./http";

const NO_BACKOFF = { firstBackoffMs: 0 };

function answer(status: number, text: string): Awaited<ReturnType<HttpGet>> {
  return { ok: status < 300, status, text: () => Promise.resolve(text) };
}

function fetchFailed(cause: unknown): Error {
  return new TypeError("fetch failed", { cause });
}

describe("HTTP reads of the meta-evidence API and the gateway", () => {
  it("returns a final answer below 500 at once, with its body", async () => {
    let calls = 0;
    const get: HttpGet = () => {
      calls += 1;
      return Promise.resolve(answer(400, '{"error":"unknown"}'));
    };
    await expect(httpGet(get, "https://api.test/key", NO_BACKOFF)).resolves.toEqual({ kind: "answer", ok: false, status: 400, text: '{"error":"unknown"}' });
    expect(calls).toBe(1);
  });

  it("retries a server error and a transport failure, then answers", async () => {
    const replies = [() => Promise.resolve(answer(502, "")), () => Promise.reject(fetchFailed(Object.assign(new Error("x"), { code: "ECONNRESET" }))), () => Promise.resolve(answer(200, "ok"))];
    const get: HttpGet = () => (replies.shift() ?? (() => Promise.reject(new Error("no more replies"))))();
    await expect(httpGet(get, "https://api.test/key", NO_BACKOFF)).resolves.toMatchObject({ kind: "answer", status: 200, text: "ok" });
  });

  it("gives up after four attempts with the last failure", async () => {
    let calls = 0;
    const get: HttpGet = () => {
      calls += 1;
      return Promise.resolve(answer(503, ""));
    };
    await expect(httpGet(get, "https://api.test/key", NO_BACKOFF)).resolves.toEqual({ kind: "failed", detail: "HTTP 503" });
    expect(calls).toBe(4);
  });
});

describe("failure descriptions", () => {
  it("names a timeout", () => {
    expect(describeFailure(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toBe("the request timed out");
  });

  it("names the cause's class and code, never its message, which can carry the host", () => {
    const cause = Object.assign(new Error("Connect Timeout Error (attempted address: api.test:443)"), { name: "ConnectTimeoutError", code: "UND_ERR_CONNECT_TIMEOUT" });
    const detail = describeFailure(fetchFailed(cause));
    expect(detail).toBe("the request failed (ConnectTimeoutError UND_ERR_CONNECT_TIMEOUT)");
    expect(detail).not.toContain("api.test");
  });

  it("C6: names the HTTP status of an RPC read failure, never its URL or details", () => {
    const detail = describeFailure(new HttpRequestError({ url: "https://rpc.example/v3/secret-key", status: 429, details: "Too Many Requests" }));
    expect(detail).toBe("HTTP 429");
  });

  it("C6: names an RPC read timeout, and a JSON-RPC refusal by its class and code", () => {
    expect(describeFailure(new TimeoutError({ body: {}, url: "https://rpc.example/v3/secret-key" }))).toBe("the request timed out");
    const refusal = new Error("wrapped", { cause: new RpcRequestError({ url: "https://rpc.example/v3/secret-key", body: {}, error: { code: -32005, message: "rate limited" } }) });
    expect(describeFailure(refusal)).toBe("the request failed (RpcRequestError -32005)");
  });

  it("names a cause without a code by its class, and an error without a cause generically", () => {
    expect(describeFailure(fetchFailed(new SyntaxError("bad")))).toBe("the request failed (SyntaxError)");
    expect(describeFailure(new Error("plain"))).toBe("the request failed");
  });
});
