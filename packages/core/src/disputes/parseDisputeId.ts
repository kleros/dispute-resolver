import { maxUint256 } from "viem";
/** Rejects over-long strings before `BigInt` parses them. */
const UINT256_MAX_DIGITS = 78;
const DIGITS = /^\d+$/;

function inRange(value: bigint): bigint | null {
  return value >= 0n && value <= maxUint256 ? value : null;
}

/** An empty or missing ID is `null`, so a route without an ID never loads dispute 0. */
export function parseDisputeId(input: unknown): bigint | null {
  if (typeof input === "bigint") return inRange(input);
  if (typeof input === "number") return Number.isSafeInteger(input) && input >= 0 ? BigInt(input) : null;
  if (typeof input !== "string" || !DIGITS.test(input)) return null;
  const significant = input.replace(/^0+(?=\d)/, "");
  if (significant.length > UINT256_MAX_DIGITS) return null;
  return inRange(BigInt(significant));
}
