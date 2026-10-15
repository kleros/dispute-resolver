import { createPublicClient, custom } from "viem";
import { lookupDispute } from "../../../../packages/core/src/disputes";
import type { DisputeLookup } from "../../../../packages/core/src/disputes/types";
import type { ReadClient } from "../../../../packages/core/src/types";
import type { ChainReader } from "../chains";
import { ATTEMPTS, backOff, DEFAULT_RETRY, describeFailure, type RetryPolicy } from "../http";
import type { RawRequest } from "../pinnedClient";

/**
 * The number of disputes of an arbitrator whose IDs run from 0 without gaps, from an existence test: doubling until an
 * ID does not exist, then bisecting. `exists` rejects on a transport failure it could not recover from, never answers
 * false for it, so a flaky read never shortens the count.
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
 * One lookup of `disputeId` through core's `lookupDispute`, with the failure its transport threw (viem's
 * `HttpRequestError`, `TimeoutError`, …), which core reduces to a short message without the HTTP status or the cause.
 */
async function observedLookup(reader: ChainReader, disputeId: bigint): Promise<{ readonly lookup: DisputeLookup; readonly failure: unknown }> {
  let failure: unknown;
  // viem types `request` per method; the observing client forwards any method unchanged.
  const forward = reader.client.request as unknown as RawRequest;
  const request: RawRequest = async (call) => {
    try {
      return await forward(call);
    } catch (error) {
      failure = error;
      throw error;
    }
  };
  const client: ReadClient = createPublicClient({ transport: custom({ request }, { key: "observed-read-rpc", name: "Observed read RPC", retryCount: 0 }) });
  const lookup = await lookupDispute({ chainId: reader.chainId, client }, disputeId);
  return { lookup, failure };
}

/**
 * Whether a dispute exists on the reader's chain as of its block, through core's `lookupDispute`: a reverting
 * `disputes(id)` (mainnet, Sepolia) and a zeroed struct (Gnosis, Chiado; P-08) both mean it does not. An unavailable
 * lookup is retried on the gate's schedule (`ATTEMPTS`, `retry`'s back-off), longer than core's spec 9.1 budget, which
 * is meant for the app; when the attempts run out it rejects with the failure class of the last attempt (HTTP status,
 * timeout, or cause class and code; never the RPC URL), never answers false. A chain without an arbitrator rejects at
 * once.
 */
export function disputeExists(reader: ChainReader, retry: RetryPolicy = DEFAULT_RETRY): (disputeId: bigint) => Promise<boolean> {
  return async (disputeId) => {
    let detail = "no attempt was made";
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      await backOff(retry, attempt);
      const { lookup, failure } = await observedLookup(reader, disputeId);
      if (lookup.status === "found") return true;
      if (lookup.status === "not-found") return false;
      if (lookup.status === "no-arbitrator") throw new Error(`Chain ${String(reader.chainId)} has no arbitrator.`);
      detail = failure === undefined ? lookup.error.message : `${lookup.error.message} (${describeFailure(failure)})`;
    }
    throw new Error(`Could not read dispute ${disputeId.toString()} after ${String(ATTEMPTS)} attempts: ${detail}`);
  };
}
