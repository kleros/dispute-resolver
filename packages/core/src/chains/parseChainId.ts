import { getChain } from "./table";

const DECIMAL_NO_LEADING_ZERO = /^[1-9]\d*$/;

/**
 * The lexical half of `parseChainId`: a safe positive integer, or a string of ASCII digits without sign, whitespace or
 * leading zero, whether or not the chain table has it. Never throws.
 */
export function parseChainNumber(input: unknown): number | undefined {
  let candidate: number;
  if (typeof input === "number") {
    candidate = input;
  } else if (typeof input === "string" && DECIMAL_NO_LEADING_ZERO.test(input)) {
    candidate = Number(input);
  } else {
    return undefined;
  }
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : undefined;
}

/**
 * The single parser for untrusted chain IDs (the URL segment, meta-evidence chain IDs): `parseChainNumber`, kept only
 * when the chain table has it. Never throws.
 */
export function parseChainId(input: unknown): number | undefined {
  const candidate = parseChainNumber(input);
  return candidate === undefined ? undefined : getChain(candidate)?.id;
}
