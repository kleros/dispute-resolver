import { ContractFunctionExecutionError, ContractFunctionRevertedError, HttpRequestError, UserRejectedRequestError, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { errorMessage, isUserRejection } from "./errors";

const ARBITRATOR = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const UNKNOWN_CONTRACT = "0x1111111111111111111111111111111111111111";
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

function wrapped(cause: ContractFunctionRevertedError, contractAddress: `0x${string}`): ContractFunctionExecutionError {
  return new ContractFunctionExecutionError(cause, { abi: FUND_APPEAL_ABI, functionName: "fundAppeal", args: [1n, 2n], contractAddress });
}

describe("errorMessage", () => {
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
    expect(isUserRejection(writeRevert(UNKNOWN_CONTRACT, "funds frozen until the audit ends"))).toBe(false);
    expect(isUserRejection(new ContractFunctionExecutionError(rejection, { abi: FUND_APPEAL_ABI, functionName: "fundAppeal", args: [1n, 2n], contractAddress: ARBITRATOR }))).toBe(
      true,
    );
  });

  it("an EIP-1193 4001 deep in the cause chain is a rejection too", () => {
    expect(isUserRejection(new Error("Contract call failed.", { cause: Object.assign(new Error("denied"), { code: 4001 }) }))).toBe(true);
  });
});
