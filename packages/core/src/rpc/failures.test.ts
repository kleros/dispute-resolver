import { createPublicClient, custom } from "viem";
import { describe, expect, it } from "vitest";
import { klerosLiquidAbi } from "../abi";
import type { Address } from "../types";
import { LookupLimitError, describeError, isContractFailure, readFailure } from "./index";
import { rpcError } from "../test/rpc/testHelpers";

const ARBITRATOR: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";

/** The error `readContract` throws when the node answers `eth_call` with `answer` (an error, or raw return data). */
async function readError(answer: Error | `0x${string}`): Promise<unknown> {
  const request = ({ method }: { method: string }): Promise<unknown> => {
    if (method !== "eth_call") return Promise.reject(rpcError(-32601, `unexpected method ${method}`));
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  const client = createPublicClient({ transport: custom({ request }, { retryCount: 0 }) });
  try {
    await client.readContract({ address: ARBITRATOR, abi: klerosLiquidAbi, functionName: "disputes", args: [7n] });
  } catch (error) {
    return error;
  }
  throw new Error("expected the read to fail");
}

describe("isContractFailure", () => {
  it.each([
    ["3 execution reverted (Gnosis)", 3, "execution reverted"],
    ["-32000 invalid opcode (Sepolia)", -32000, "invalid opcode: INVALID"],
    ["-32003 InvalidFEOpcode (mainnet)", -32003, "EVM error: InvalidFEOpcode"],
  ])("D-53: a failure of the contract (%s) is a contract failure", async (_, code, message) => {
    expect(isContractFailure(await readError(rpcError(code, message)))).toBe(true);
  });

  it("§10.9: no return data from a fallback function is a contract failure", async () => {
    expect(isContractFailure(await readError("0x"))).toBe(true);
  });

  it.each([
    ["-32603 Internal error", -32603, "Internal error"],
    ["-32000 header not found", -32000, "header not found"],
    ["-32005 rate limited", -32005, "daily request count exceeded, request rate limited"],
  ])("D-36: a transport failure (%s) is never a contract failure", async (_, code, message) => {
    expect(isContractFailure(await readError(rpcError(code, message)))).toBe(false);
  });

  it("D-36: an error that is not viem's is never a contract failure", () => {
    expect(isContractFailure(new Error("execution reverted"))).toBe(false);
  });
});

describe("describeError", () => {
  it("A13: a viem error is described by its short message, never with the transport URL", async () => {
    const error = await readError(new Error("request to https://rpc.example/v3/secret-key failed"));
    expect(describeError(error)).not.toContain("secret-key");
  });

  it("names a budget exhaustion and an abort, and never quotes any other error", () => {
    expect(describeError(new LookupLimitError("The lookup ran out of requests."))).toBe("The lookup ran out of requests.");
    expect(describeError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe("The request was aborted.");
    expect(describeError(new Error("https://rpc.example/v3/secret-key"))).toBe("The request failed.");
  });
});

describe("readFailure", () => {
  it("D-53: labels a contract failure reverted and a transport failure rpc-error, with a safe reason", async () => {
    const reverted = readFailure("the dispute", await readError(rpcError(3, "execution reverted")));
    expect(reverted.code).toBe("reverted");
    expect(reverted.message).toMatch(/^Could not read the dispute: /);
    expect(readFailure("the dispute", await readError(rpcError(-32000, "header not found")))).toMatchObject({ code: "rpc-error" });
  });
});
