import { BaseError, ContractFunctionExecutionError, ContractFunctionRevertedError, ContractFunctionZeroDataError, ExecutionRevertedError } from "viem";
import { CHAINS } from "../chains";
import { REGISTRY, registryKey } from "../registry";
import type { Address, Unavailable } from "../types";
import { isLookupLimitError } from "./errors";

/**
 * Nodes report the same EVM failure differently: `3 "execution reverted"` (Gnosis), `-32000 "invalid opcode: INVALID"`
 * (Sepolia) and `-32003 "EVM error: InvalidFEOpcode"` (mainnet, Sepolia; the out-of-range `disputes(id)` of KlerosLiquid
 * and `getRoundInfo` of a governor).
 */
const EXECUTION_FAILURE = /execution reverted|\breverted?\b|invalid opcode|InvalidFEOpcode|invalid jump|out of gas|stack (?:underflow|overflow)/i;

const CONTRACT_REJECTED = "The contract rejected the call.";

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

let knownContracts: ReadonlySet<string> | undefined;

/**
 * The contracts whose own failure text may be shown, each on its own chain only: the chain table's arbitrator and
 * arbitrable proxy, and every arbitrable the registry lists (Reality proxies, overrides, display allowlist). Built on
 * first use, since the tables load after this module.
 */
function isKnownContract(chainId: number, address: string): boolean {
  knownContracts ??= new Set<string>([
    ...Object.values(CHAINS).flatMap((chain) =>
      [chain.klerosLiquid, chain.arbitrableProxy].flatMap((contract) => (contract === undefined ? [] : [registryKey(chain.id, contract)])),
    ),
    ...Object.keys(REGISTRY.realityProxies),
    ...Object.keys(REGISTRY.overrides),
    ...Object.entries(REGISTRY.displayAllowlist).flatMap(([chainKey, addresses]) => addresses.map((contract) => registryKey(Number(chainKey), contract))),
  ]);
  // The cast is sound: viem recorded a `0x`-prefixed address, and lowercasing it yields the lowercase form.
  return knownContracts.has(registryKey(chainId, address.toLowerCase() as Address));
}

/** The address of the contract the failed call targeted, as viem recorded it on the request; `null` when it recorded none. */
function calledContract(error: BaseError): string | null {
  const execution = error.walk((cause) => cause instanceof ContractFunctionExecutionError);
  return execution instanceof ContractFunctionExecutionError && execution.contractAddress !== undefined ? execution.contractAddress : null;
}

/**
 * Whether the error's short message quotes the called contract's own text: a contract failure, or a revert viem built
 * from the node's message alone (JSON-RPC code 3 or -32603 with no return data), whose reason is that whole message.
 */
function quotesContractText(error: BaseError): boolean {
  return isContractFailure(error) || error.walk((cause) => cause instanceof ContractFunctionRevertedError) !== null;
}

/**
 * A viem error's full `message` can carry the transport URL, and with it the RPC key, so only its `shortMessage` is
 * shown. The contract's own text is shown only for a known contract (the chain's arbitrator or arbitrable proxy, a
 * registry arbitrable) on `chainId`, the chain the call was made on, and is otherwise one fixed sentence, also when
 * `chainId` is not given. Any other error is named, never quoted.
 */
export function describeError(error: unknown, chainId?: number): string {
  if (error instanceof BaseError) {
    if (!quotesContractText(error)) return error.shortMessage;
    const address = calledContract(error);
    return chainId !== undefined && address !== null && isKnownContract(chainId, address) ? error.shortMessage : CONTRACT_REJECTED;
  }
  if (isLookupLimitError(error)) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "The request was aborted.";
  return "The request failed.";
}

/** `chainId` is the chain the failed read was made on, as `describeError` takes it. */
export function readFailure(what: string, error: unknown, chainId?: number): Unavailable {
  return { code: isContractFailure(error) ? "reverted" : "rpc-error", message: `Could not read ${what}: ${describeError(error, chainId)}` };
}
