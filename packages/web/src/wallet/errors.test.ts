import { ContractFunctionExecutionError, ContractFunctionRevertedError, HttpRequestError, UserRejectedRequestError, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { errorMessage, isUserRejection } from "./errors";

const MAINNET = 1;
const GNOSIS = 100;
/** Mainnet KlerosLiquid, the chain table's arbitrator. */
const ARBITRATOR = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const UNKNOWN_CONTRACT = "0x1111111111111111111111111111111111111111";
const REASON = "funds frozen until the audit ends";
const FUND_APPEAL_ABI = [
  {
    type: "function",
    name: "fundAppeal",
    stateMutability: "payable",
    inputs: [
      { type: "uint256", name: "_localDisputeID" },
      { type: "uint256", name: "_ruling" },
    ],
    outputs: [],
  },
] as const;

/** The error viem's `writeContract` throws when the wallet's gas estimation reports the contract's revert, with its `Error(string)` data. */
function writeRevert(contractAddress: `0x${string}`, reason: string): ContractFunctionExecutionError {
  const data = encodeErrorResult({ abi: [{ type: "error", name: "Error", inputs: [{ type: "string", name: "message" }] }], errorName: "Error", args: [reason] });
  return wrapped(new ContractFunctionRevertedError({ abi: FUND_APPEAL_ABI, functionName: "fundAppeal", data }), contractAddress);
}

/** The error viem builds when the wallet reports the revert as a bare message, with no return data. */
function writeRevertMessage(contractAddress: `0x${string}`, reason: string): ContractFunctionExecutionError {
  return wrapped(new ContractFunctionRevertedError({ abi: FUND_APPEAL_ABI, functionName: "fundAppeal", message: reason }), contractAddress);
}

function wrapped(cause: ContractFunctionRevertedError, contractAddress: `0x${string}`): ContractFunctionExecutionError {
  return new ContractFunctionExecutionError(cause, { abi: FUND_APPEAL_ABI, functionName: "fundAppeal", args: [1n, 2n], contractAddress });
}

describe("errorMessage", () => {
  it("the arbitrator's revert on its own chain keeps its own reason, given as return data or as a bare message", () => {
    expect(errorMessage(writeRevert(ARBITRATOR, REASON), MAINNET)).toContain(REASON);
    expect(errorMessage(writeRevertMessage(ARBITRATOR, REASON), MAINNET)).toContain(REASON);
  });

  it("the arbitrator's address reverting on another chain, or with no chain given, is described by the fixed sentence", () => {
    expect(errorMessage(writeRevert(ARBITRATOR, REASON), GNOSIS)).toBe("The contract rejected the call.");
    expect(errorMessage(writeRevert(ARBITRATOR, REASON))).toBe("The contract rejected the call.");
  });

  it("any other contract's revert is described by one fixed sentence, given as return data or as a bare message", () => {
    for (const message of [errorMessage(writeRevert(UNKNOWN_CONTRACT, REASON), MAINNET), errorMessage(writeRevertMessage(UNKNOWN_CONTRACT, REASON), MAINNET)]) {
      expect(message).toBe("The contract rejected the call.");
      expect(message).not.toContain(REASON);
    }
  });

  it("a transport failure keeps viem's short message, never the URL", () => {
    const error = new HttpRequestError({ url: "https://rpc.example/v3/secret-key", details: "fetch failed" });
    expect(errorMessage(error)).toBe("HTTP request failed.");
  });

  it("a plain error keeps its message and anything else reads as an unknown error", () => {
    expect(errorMessage(new Error("insufficient funds for gas"))).toBe("insufficient funds for gas");
    expect(errorMessage(new Error("  "))).toBe("Unknown error.");
    expect(errorMessage("text")).toBe("Unknown error.");
  });
});

describe("isUserRejection", () => {
  it("a wrapped user rejection is still a rejection", () => {
    const rejection = new UserRejectedRequestError(new Error("User rejected the request."));
    expect(isUserRejection(writeRevert(UNKNOWN_CONTRACT, REASON))).toBe(false);
    expect(isUserRejection(new ContractFunctionExecutionError(rejection, { abi: FUND_APPEAL_ABI, functionName: "fundAppeal", args: [1n, 2n], contractAddress: ARBITRATOR }))).toBe(
      true,
    );
  });

  it("an EIP-1193 4001 deep in the cause chain is a rejection too", () => {
    expect(isUserRejection(new Error("Contract call failed.", { cause: Object.assign(new Error("denied"), { code: 4001 }) }))).toBe(true);
  });
});
