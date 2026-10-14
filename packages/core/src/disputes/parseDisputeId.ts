const UINT256_MAX = 2n ** 256n - 1n;
/** `UINT256_MAX` has 78 decimal digits; longer digit strings, once leading zeros are removed, are out of range. */
const UINT256_MAX_DIGITS = 78;
const DIGITS = /^\d+$/;

function inRange(value: bigint): bigint | null {
  return value >= 0n && value <= UINT256_MAX ? value : null;
}

/**
 * A dispute ID from untrusted input such as the URL segment (A19, D-09): a string of ASCII digits with no sign,
 * whitespace or other character, a non-negative safe integer, or a bigint, each at most uint256. Anything else, including
 * an empty or missing ID, is `null`, so a route without an ID never loads dispute 0.
 */
export function parseDisputeId(input: unknown): bigint | null {
  if (typeof input === "bigint") return inRange(input);
  if (typeof input === "number") return Number.isSafeInteger(input) && input >= 0 ? BigInt(input) : null;
  if (typeof input !== "string" || !DIGITS.test(input)) return null;
  const significant = input.replace(/^0+(?=\d)/, "");
  if (significant.length > UINT256_MAX_DIGITS) return null;
  return inRange(BigInt(significant));
}
