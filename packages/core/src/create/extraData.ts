import type { Hex } from "../types";
import { MAX_UINT256 } from "./limits";

function uint256Word(value: bigint, name: string): string {
  if (value < 0n || value > MAX_UINT256) throw new RangeError(`${name} must fit a uint256, got ${value.toString()}`);
  return value.toString(16).padStart(64, "0");
}

/**
 * KlerosLiquid's `extraData` (spec 4.5): `0x`, the court ID as 64 hex digits, then the vote count as 64 hex digits.
 * Throws a `RangeError` for a value outside uint256; `validateCreateInput` only produces values in range.
 */
export function encodeExtraData(courtId: bigint, votes: bigint): Hex {
  return `0x${uint256Word(courtId, "courtId")}${uint256Word(votes, "votes")}`;
}
