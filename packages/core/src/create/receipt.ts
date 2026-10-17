import { toEventSelector } from "viem";
import type { Address, Hex } from "../types";

const DISPUTE_CREATION_TOPIC = toEventSelector("DisputeCreation(uint256,address)");
const WORD = /^0x[0-9a-fA-F]{64}$/;

/**
 * The dispute ID created by a `createDispute` transaction (spec 4.5 step 8): `topics[1]` of the first log the
 * arbitrator emitted with the `DisputeCreation(uint256,address)` topic. `null` when there is none, or when that log is
 * malformed, so the UI reports it instead of navigating (D-07).
 */
export function disputeIdFromReceipt(logs: readonly { readonly address: string; readonly topics: readonly Hex[] }[], arbitrator: Address): bigint | null {
  const creation = logs.find((log) => log.address.toLowerCase() === arbitrator && log.topics[0]?.toLowerCase() === DISPUTE_CREATION_TOPIC);
  const disputeId = creation?.topics[1];
  return disputeId !== undefined && WORD.test(disputeId) ? BigInt(disputeId) : null;
}
