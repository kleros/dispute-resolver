import { getChain, type ChainId } from "@dispute-resolver/core";
import type { Paths } from "./types";

/** The largest dispute ID the arbitrator can hold (uint256). */
const UINT256_MAX = 2n ** 256n - 1n;

const ALL_DIGITS = /^\d+$/;

/** Whether `chainId` can be a chain ID at all: a positive safe integer. Configured or not is a separate question. */
export function isChainNumber(chainId: number): boolean {
  return Number.isSafeInteger(chainId) && chainId > 0;
}

/** A path segment for a configured chain; anything else is a programming error, never a URL (A19). */
function chainSegment(chainId: ChainId): string {
  if (!isChainNumber(chainId) || getChain(chainId) === undefined) throw new RangeError("A path needs a configured chain ID.");
  return String(chainId);
}

function disputeSegment(disputeId: bigint): string {
  if (typeof disputeId !== "bigint" || disputeId < 0n || disputeId > UINT256_MAX) throw new RangeError("A case path needs a dispute ID between 0 and 2^256 - 1.");
  return disputeId.toString();
}

/** Internal navigation targets (A19, spec §1.4), written without a trailing slash. */
export const paths: Paths = Object.freeze({
  chainRoot: (chainId: ChainId) => `/${chainSegment(chainId)}`,
  ongoing: (chainId: ChainId) => `/${chainSegment(chainId)}/ongoing`,
  create: (chainId: ChainId) => `/${chainSegment(chainId)}/create`,
  cases: (chainId: ChainId) => `/${chainSegment(chainId)}/cases`,
  case: (chainId: ChainId, disputeId: bigint) => `/${chainSegment(chainId)}/cases/${disputeSegment(disputeId)}`,
});

/**
 * Today's `syncUrlWithChain` rule (spec §1.3): an all-digit first segment is replaced by `chainId`; otherwise `chainId`
 * is inserted as the first segment. The rest of the path is kept as it is. `chainId` is the wallet's chain, which may be
 * unconfigured (the result then shows the unsupported-network screen), but it must be a positive integer.
 */
export function replaceChainSegment(pathname: string, chainId: number): string {
  if (!isChainNumber(chainId)) throw new RangeError("A chain ID is a positive integer.");
  const parts = pathname.split("/");
  const first = parts[1] ?? "";
  if (ALL_DIGITS.test(first)) parts[1] = String(chainId);
  else parts.splice(1, 0, String(chainId));
  return parts.join("/");
}
