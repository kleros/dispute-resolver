import { toEventSelector } from "viem";
import type { Address, Hex } from "../types";

const DISPUTE_CREATION_TOPIC = toEventSelector("DisputeCreation(uint256,address)");
const WORD = /^0x[0-9a-fA-F]{64}$/;

/** `null` when the arbitrator emitted no `DisputeCreation` log or it is malformed, so the UI reports it instead of navigating. */
export function disputeIdFromReceipt(logs: readonly { readonly address: string; readonly topics: readonly Hex[] }[], arbitrator: Address): bigint | null {
  const creation = logs.find((log) => log.address.toLowerCase() === arbitrator && log.topics[0]?.toLowerCase() === DISPUTE_CREATION_TOPIC);
  const disputeId = creation?.topics[1];
  return disputeId !== undefined && WORD.test(disputeId) ? BigInt(disputeId) : null;
}
