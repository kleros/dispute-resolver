import { answerString, isUint256, toHexWord } from "./realityLib";
import type { FallbackOutcomes, RulingOptions } from "./types";

/** The text of ruling 0 (spec 5.9). */
export const REFUSED_RULING_TEXT = "invalid / refused to arbitrate / tied";

/** The fallback outcome of a ruling, indexed by ruling − 1, or `undefined` when there is none (spec 5.9). */
function fallbackOutcome(ruling: bigint, fallback: FallbackOutcomes): string | undefined {
  if (fallback === null || ruling > BigInt(fallback.length)) return undefined;
  return fallback[Number(ruling - 1n)];
}

/** Whether the options are a single-select question without titles, absent or empty (P-24). */
function isTitleLessSelect(options: RulingOptions): boolean {
  return options.type === "single-select" && (options.titles === undefined || options.titles.length === 0);
}

/**
 * The text of a ruling (spec 5.9): ruling 0 is the refused text; a hash question reads the ruling as 64 hex digits;
 * with ruling options it is reality-eth-lib's answer string for ruling − 1; without them it is the fallback outcome.
 * A single-select without titles (absent or empty) whose label is empty reads as the ruling's decimal value (P-24);
 * the library is asked first, so reserved answers keep its label (P-14). Anything that cannot be formatted reads as the
 * ruling's decimal value. Never throws.
 */
export function formatRuling(ruling: bigint, options: RulingOptions | null, fallback: FallbackOutcomes): string {
  if (ruling === 0n) return REFUSED_RULING_TEXT;
  const decimal = ruling.toString();
  if (!isUint256(ruling)) return decimal;
  if (options === null) return fallbackOutcome(ruling, fallback) ?? decimal;
  if (options.type === "hash") return toHexWord(ruling);
  const label = answerString({ type: options.type, decimals: options.precision, outcomes: options.titles }, ruling - 1n);
  if (label === "" && isTitleLessSelect(options)) return decimal;
  return label ?? decimal;
}

/** The bytes of a uint256, big-endian, without leading zero bytes. */
function toBytes(value: bigint): Uint8Array {
  const bytes: number[] = [];
  for (let rest = value; rest > 0n; rest >>= 8n) bytes.unshift(Number(rest & 0xffn));
  return Uint8Array.from(bytes);
}

/**
 * The title of a contributed ruling code on a variable-type question (spec 5.12 item 6): the code's bytes as UTF-8 for
 * a string question (invalid sequences read as U+FFFD, and a leading U+FEFF is kept as part of the answer), the code as 64 hex digits for a hash question, and the 5.9
 * text otherwise. Never throws.
 */
export function decodeRulingCode(code: bigint, options: RulingOptions, fallback: FallbackOutcomes): string {
  if (!isUint256(code)) return code.toString();
  switch (options.type) {
    case "string":
      return new TextDecoder("utf-8", { ignoreBOM: true }).decode(toBytes(code));
    case "hash":
      return toHexWord(code);
    default:
      return formatRuling(code, options, fallback);
  }
}
