import { getChain } from "./table";

const DECIMAL_NO_LEADING_ZERO = /^[1-9]\d*$/;

/**
 * The single parser for untrusted chain IDs (the URL segment, meta-evidence chain IDs). Accepts a safe-integer number
 * or a string of ASCII digits without sign, whitespace or leading zero, and returns the ID only when the chain table
 * has it. Never throws.
 */
export function parseChainId(input: unknown): number | undefined {
  let candidate: number;
  if (typeof input === "number") {
    candidate = input;
  } else if (typeof input === "string" && DECIMAL_NO_LEADING_ZERO.test(input)) {
    candidate = Number(input);
  } else {
    return undefined;
  }
  if (!Number.isSafeInteger(candidate)) return undefined;
  return getChain(candidate)?.id;
}
