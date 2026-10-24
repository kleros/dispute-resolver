import { HttpRequestError } from "viem";
import { describe, expect, it } from "vitest";
import { rejectionError } from "./sectionData";

describe("rejectionError", () => {
  it("names a viem rejection by its short message, without the RPC URL its full message carries", () => {
    const error = new HttpRequestError({ body: { method: "eth_getCode" }, status: 401, url: "https://rpc.example/v2/abc123SECRETxyz" });
    expect(rejectionError(error)).toEqual({ code: "rpc-error", message: "HTTP request failed." });
  });

  it("never quotes a rejection that is not viem's", () => {
    expect(rejectionError(new Error("request to https://rpc.example/v2/abc123SECRETxyz failed"))).toEqual({ code: "rpc-error", message: "The request failed." });
    expect(rejectionError("https://rpc.example/v2/abc123SECRETxyz")).toEqual({ code: "rpc-error", message: "The request failed." });
  });
});
