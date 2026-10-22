import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError, ExecutionRevertedError } from "viem";
import type { Unavailable } from "../types";
import { isLookupLimitError } from "./errors";

/**
 * Nodes report the same EVM failure differently: `3 "execution reverted"` (Gnosis), `-32000 "invalid opcode: INVALID"`
 * (Sepolia) and `-32003 "EVM error: InvalidFEOpcode"` (mainnet, Sepolia; the out-of-range `disputes(id)` of KlerosLiquid
 * and `getRoundInfo` of a governor).
 */
const EXECUTION_FAILURE = /execution reverted|\breverted?\b|invalid opcode|InvalidFEOpcode|invalid jump|out of gas|stack (?:underflow|overflow)/i;

/** Whether a node's error message reports a failure of the contract's own execution. */
export function isExecutionFailureMessage(message: string): boolean {
  return EXECUTION_FAILURE.test(message);
}

/**
 * Whether a failed `readContract` was a failure of the contract (a revert, an invalid opcode, no return data from a
 * fallback function) rather than of the transport. The JSON-RPC code alone cannot tell: viem reads `-32603 "Internal
 * error"` and an empty `0x` revert as a revert, and `-32000` also carries transport failures such as "header not found",
 * so the node's message decides. Only a contract failure may be read as "absent" or "does not exist"; a transport
 * failure never is.
 */
export function isContractFailure(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  const failure = error.walk(
    (cause) =>
      cause instanceof ExecutionRevertedError ||
      cause instanceof ContractFunctionZeroDataError ||
      (cause instanceof ContractFunctionRevertedError && cause.raw !== undefined && cause.raw !== "0x") ||
      (cause instanceof BaseError && isExecutionFailureMessage(cause.details)),
  );
  return failure !== null;
}

/**
 * A viem error's full `message` can carry the transport URL, and with it the RPC key, so only its `shortMessage` is
 * shown; any other error is named, never quoted.
 */
export function describeError(error: unknown): string {
  if (error instanceof BaseError) return error.shortMessage;
  if (isLookupLimitError(error)) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "The request was aborted.";
  return "The request failed.";
}

export function readFailure(what: string, error: unknown): Unavailable {
  return { code: isContractFailure(error) ? "reverted" : "rpc-error", message: `Could not read ${what}: ${describeError(error)}` };
}
