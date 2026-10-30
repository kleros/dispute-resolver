import { isUint256 } from "../bigint";

/** Rejects over-long strings before `BigInt` parses them. */
const UINT256_MAX_DIGITS = 78;
const DIGITS = /^\d+$/;

/** An empty or missing ID is `null`, so a route without an ID never loads dispute 0. */
export function parseDisputeId(input: unknown): bigint | null {
  if (typeof input === "bigint") return isUint256(input) ? input : null;
  if (typeof input === "number") return Number.isSafeInteger(input) && input >= 0 ? BigInt(input) : null;
  if (typeof input !== "string" || !DIGITS.test(input)) return null;
  const significant = input.replace(/^0+(?=\d)/, "");
  if (significant.length > UINT256_MAX_DIGITS) return null;
  const value = BigInt(significant);
  return isUint256(value) ? value : null;
}
