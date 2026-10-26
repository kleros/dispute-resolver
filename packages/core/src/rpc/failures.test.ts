import { createPublicClient, custom, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { klerosLiquidAbi } from "../abi";
import type { Address } from "../types";
import { LookupLimitError, describeError, isContractFailure, readFailure } from "./index";
import { rpcError } from "../test/rpc/testHelpers";

const MAINNET = 1;
const GNOSIS = 100;
/** Mainnet KlerosLiquid, the chain table's arbitrator. */
const ARBITRATOR: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
/** The mainnet arbitrable proxy the chain table configures for the Create page. */
const CONFIGURED_PROXY: Address = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
/** Unslashed (mainnet), an arbitrable with a registry override. */
const REGISTERED_ARBITRABLE: Address = "0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38";
/** A Gnosis Reality.eth proxy listed in the registry. */
const REGISTERED_PROXY: Address = "0x2a2bab2c2d4eb5007b0389720b287d4d19dc4001";
/** Proof of Humanity v2 (mainnet), listed only in the registry's display allowlist. */
const DISPLAY_ALLOWLISTED: Address = "0xbe9834097a4e97689d9b667441acafb456d0480a";
const UNKNOWN_CONTRACT: Address = "0x1111111111111111111111111111111111111111";
const REASON = "funds frozen until the audit ends";
const FIXED_SENTENCE = "The contract rejected the call.";

/** A revert carrying `Error(string)` return data, as a node reports it with code 3. */
function revertWithData(reason: string): Error {
  const data = encodeErrorResult({ abi: [{ type: "error", name: "Error", inputs: [{ type: "string", name: "message" }] }], errorName: "Error", args: [reason] });
  return Object.assign(rpcError(3, "execution reverted"), { data });
}

async function readError(answer: Error | `0x${string}`, address: Address = ARBITRATOR): Promise<unknown> {
  const request = ({ method }: { method: string }): Promise<unknown> => {
    if (method !== "eth_call") return Promise.reject(rpcError(-32601, `unexpected method ${method}`));
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  const client = createPublicClient({ transport: custom({ request }, { retryCount: 0 }) });
  try {
    await client.readContract({ address, abi: klerosLiquidAbi, functionName: "disputes", args: [7n] });
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
  ])("an EVM failure reported as %s is a contract failure", async (_, code, message) => {
    expect(isContractFailure(await readError(rpcError(code, message)))).toBe(true);
  });

  it("no return data from a fallback function is a contract failure", async () => {
    expect(isContractFailure(await readError("0x"))).toBe(true);
  });

  it.each([
    ["-32603 Internal error", -32603, "Internal error"],
    ["-32000 header not found", -32000, "header not found"],
    ["-32005 rate limited", -32005, "daily request count exceeded, request rate limited"],
  ])("a transport failure (%s) is never a contract failure", async (_, code, message) => {
    expect(isContractFailure(await readError(rpcError(code, message)))).toBe(false);
  });

  it("an error that is not viem's is never a contract failure", () => {
    expect(isContractFailure(new Error("execution reverted"))).toBe(false);
  });
});

describe("describeError", () => {
  it("names a budget exhaustion and an abort, and never quotes any other error", () => {
    expect(describeError(new LookupLimitError("The lookup ran out of requests."))).toBe("The lookup ran out of requests.");
    expect(describeError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe("The request was aborted.");
    expect(describeError(new Error("https://rpc.example/v3/secret-key"))).toBe("The request failed.");
  });

  it("the arbitrator's revert keeps its own reason, given as return data or as the node's message", async () => {
    expect(describeError(await readError(revertWithData(REASON), ARBITRATOR), MAINNET)).toContain(REASON);
    expect(describeError(await readError(rpcError(3, `execution reverted: ${REASON}`), ARBITRATOR), MAINNET)).toContain(REASON);
  });

  it("the chain's configured arbitrable proxy keeps its own reason", async () => {
    expect(describeError(await readError(revertWithData("appeal fee already paid"), CONFIGURED_PROXY), MAINNET)).toContain("appeal fee already paid");
  });

  it("a registry arbitrable's revert keeps its own reason, whether the registry overrides it, lists it as a Reality proxy or allowlists its display", async () => {
    for (const [address, chainId] of [
      [REGISTERED_ARBITRABLE, MAINNET],
      [REGISTERED_PROXY, GNOSIS],
      [DISPLAY_ALLOWLISTED, MAINNET],
    ] as const) {
      expect(describeError(await readError(revertWithData(REASON), address), chainId)).toContain(REASON);
    }
  });

  it("a known contract's address called on another chain is described by the fixed sentence", async () => {
    for (const [address, chainId] of [
      [ARBITRATOR, GNOSIS],
      [CONFIGURED_PROXY, GNOSIS],
      [REGISTERED_ARBITRABLE, GNOSIS],
      [REGISTERED_PROXY, MAINNET],
      [DISPLAY_ALLOWLISTED, GNOSIS],
    ] as const) {
      expect(describeError(await readError(revertWithData(REASON), address), chainId)).toBe(FIXED_SENTENCE);
    }
  });

  it("a contract failure is described by the fixed sentence when the called chain is not given, even on a known contract", async () => {
    expect(describeError(await readError(revertWithData(REASON), ARBITRATOR))).toBe(FIXED_SENTENCE);
    expect(readFailure("the dispute", await readError(revertWithData(REASON), ARBITRATOR)).message).toBe(`Could not read the dispute: ${FIXED_SENTENCE}`);
  });

  it("the address of a known contract is matched whatever its letter case", async () => {
    const checksummed = "0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069" as Address;
    expect(describeError(await readError(revertWithData(REASON), checksummed), MAINNET)).toContain(REASON);
  });

  it("any other contract's failure is described by one fixed sentence, whatever the contract says", async () => {
    for (const answer of [revertWithData(REASON), rpcError(3, `execution reverted: ${REASON}`), rpcError(-32003, "EVM error: InvalidFEOpcode"), "0x" as const]) {
      const described = describeError(await readError(answer, UNKNOWN_CONTRACT), MAINNET);
      expect(described).toBe(FIXED_SENTENCE);
      expect(described).not.toContain(REASON);
    }
  });

  it("a revert whose reason is the node's whole message, with no return data and no reverted wording, is still quoted only for a known contract", async () => {
    for (const code of [3, -32603]) {
      const onUnknown = describeError(await readError(rpcError(code, REASON), UNKNOWN_CONTRACT), MAINNET);
      expect(onUnknown).toBe(FIXED_SENTENCE);
      expect(onUnknown).not.toContain(REASON);
      expect(describeError(await readError(rpcError(code, REASON), ARBITRATOR), MAINNET)).toContain(REASON);
    }
  });

  it("a transport failure on any contract keeps viem's short message, never the URL", async () => {
    const withUrl = describeError(await readError(new Error("request to https://rpc.example/v3/secret-key failed"), UNKNOWN_CONTRACT));
    expect(withUrl).not.toBe(FIXED_SENTENCE);
    expect(withUrl).not.toContain("secret-key");
    for (const answer of [rpcError(-32000, "header not found"), rpcError(-32005, "daily request count exceeded, request rate limited")]) {
      const onUnknown = describeError(await readError(answer, UNKNOWN_CONTRACT), MAINNET);
      expect(onUnknown).not.toBe(FIXED_SENTENCE);
      expect(onUnknown).toBe(describeError(await readError(answer, ARBITRATOR), MAINNET));
    }
  });
});

describe("readFailure", () => {
  it("labels a contract failure reverted and a transport failure rpc-error, with a safe reason", async () => {
    const reverted = readFailure("the dispute", await readError(rpcError(3, "execution reverted")));
    expect(reverted.code).toBe("reverted");
    expect(reverted.message).toMatch(/^Could not read the dispute: /);
    expect(readFailure("the dispute", await readError(rpcError(-32000, "header not found")))).toMatchObject({ code: "rpc-error" });
  });

  it("an unknown contract's revert is labelled reverted and described by the fixed sentence", async () => {
    expect(readFailure("the withdrawable amount", await readError(revertWithData(REASON), UNKNOWN_CONTRACT), MAINNET)).toEqual({
      code: "reverted",
      message: `Could not read the withdrawable amount: ${FIXED_SENTENCE}`,
    });
  });

  it("a bare message under the internal-error code stays labelled rpc-error, and on an unknown contract is described by the fixed sentence", async () => {
    const error = await readError(rpcError(-32603, REASON), UNKNOWN_CONTRACT);
    expect(isContractFailure(error)).toBe(false);
    expect(readFailure("the dispute", error, MAINNET)).toEqual({ code: "rpc-error", message: `Could not read the dispute: ${FIXED_SENTENCE}` });
  });
});
