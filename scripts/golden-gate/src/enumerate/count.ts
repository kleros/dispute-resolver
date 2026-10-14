import { lookupDispute } from "../../../../packages/core/src/disputes";
import type { ChainReader } from "../chains";

/**
 * The number of disputes of an arbitrator whose IDs run from 0 without gaps, from an existence test: doubling until an
 * ID does not exist, then bisecting. `exists` rejects on a transport failure, so a flaky read never shortens the count.
 */
export async function countDisputes(exists: (disputeId: bigint) => Promise<boolean>): Promise<bigint> {
  if (!(await exists(0n))) return 0n;
  let low = 0n;
  let high = 1n;
  while (await exists(high)) {
    low = high;
    high *= 2n;
  }
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if (await exists(middle)) low = middle;
    else high = middle;
  }
  return low + 1n;
}

/**
 * Whether a dispute exists on the reader's chain as of its block, through core's `lookupDispute`: a reverting
 * `disputes(id)` (mainnet, Sepolia) and a zeroed struct (Gnosis, Chiado; P-08) both mean it does not.
 */
export function disputeExists(reader: ChainReader): (disputeId: bigint) => Promise<boolean> {
  return async (disputeId) => {
    const lookup = await lookupDispute({ chainId: reader.chainId, client: reader.client }, disputeId);
    if (lookup.status === "found") return true;
    if (lookup.status === "not-found") return false;
    throw new Error(
      lookup.status === "unavailable" ? `Could not read dispute ${disputeId.toString()}: ${lookup.error.message}` : `Chain ${String(reader.chainId)} has no arbitrator.`,
    );
  };
}
