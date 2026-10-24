import { maxUint256 } from "viem";
import type { Hex } from "../types";

function uint256Word(value: bigint, name: string): string {
  if (value < 0n || value > maxUint256) throw new RangeError(`${name} must fit a uint256, got ${value.toString()}`);
  return value.toString(16).padStart(64, "0");
}

/** Throws a `RangeError` for a value outside uint256; `validateCreateInput` only produces values in range. */
export function encodeExtraData(courtId: bigint, votes: bigint): Hex {
  return `0x${uint256Word(courtId, "courtId")}${uint256Word(votes, "votes")}`;
}
