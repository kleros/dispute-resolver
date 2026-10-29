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

const CONTRACT_TEXT_MAX = 200;

/** Controls, and the invisible marks that hide text or reverse its direction. */
function isControlOrMark(codePoint: number): boolean {
  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x061c ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x2028 && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}

/**
 * A contract's own text as one plain line of at most 200 characters. Even a known contract's text is someone else's: it
 * must not reorder or hide the page's own words around it, nor run on.
 */
function plainContractText(text: string): string {
  const line = Array.from(text, (character) => (isControlOrMark(character.codePointAt(0) ?? 0) ? " " : character))
    .join("")
    .replaceAll(/\s+/g, " ")
    .trim();
  const characters = Array.from(line);
  if (characters.length <= CONTRACT_TEXT_MAX) return line;
  const kept = characters.slice(0, CONTRACT_TEXT_MAX - 1).join("");
  return `${kept.trimEnd()}…`;
}

function onKnownContract(error: BaseError, chainId: number | undefined): boolean {
  const address = calledContract(error);
  return chainId !== undefined && address !== null && isKnownContract(chainId, address);
}

/**
 * A viem error's full `message` can carry the transport URL, and with it the RPC key, so only its `shortMessage` is
 * shown. The contract's own text is shown only for a known contract (the chain's arbitrator or arbitrable proxy, a
 * registry arbitrable) on `chainId`, the chain the call was made on, as plain text, and is otherwise one fixed sentence,
 * also when `chainId` is not given. Any other error is named, never quoted.
 */
export function describeError(error: unknown, chainId?: number): string {
  if (error instanceof BaseError) {
    if (!quotesContractText(error)) return error.shortMessage;
    return onKnownContract(error, chainId) ? plainContractText(error.shortMessage) : CONTRACT_REJECTED;
  }
  if (isLookupLimitError(error)) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "The request was aborted.";
  return "The request failed.";
}

/** The wording a node puts before a revert reason it reports in its message. */
const NODE_REVERT_WORDING = /^execution reverted:?/i;

/**
 * The reason a known contract on `chainId` gave for rejecting a call, as viem decoded it, without the node's wording and
 * as plain text; `null` for any other contract, a contract that gave no reason, or a failure that was not a revert.
 */
export function rejectionReason(error: unknown, chainId: number): string | null {
  if (!(error instanceof BaseError) || !onKnownContract(error, chainId)) return null;
  const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError) || revert.reason === undefined) return null;
  const reason = plainContractText(revert.reason.trim().replace(NODE_REVERT_WORDING, ""));
  return reason === "" ? null : reason;
}

/** `chainId` is the chain the failed read was made on, as `describeError` takes it. */
export function readFailure(what: string, error: unknown, chainId?: number): Unavailable {
  return { code: isContractFailure(error) ? "reverted" : "rpc-error", message: `Could not read ${what}: ${describeError(error, chainId)}` };
}
