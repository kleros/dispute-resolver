import { DEFAULT_UINT_PRECISION } from "./precision";
import { isUint256 } from "../bigint";
import { answerString, toHexWord } from "./realityLib";
import type { FallbackOutcomes, RulingOptions } from "./types";

export const REFUSED_RULING_TEXT = "invalid / refused to arbitrate / tied";

function fallbackOutcome(ruling: bigint, fallback: FallbackOutcomes): string | undefined {
  if (fallback === null || ruling > BigInt(fallback.length)) return undefined;
  return fallback[Number(ruling - 1n)];
}

function isTitleLessSelect(options: RulingOptions): boolean {
  return options.type === "single-select" && (options.titles === undefined || options.titles.length === 0);
}

/**
 * The text of a ruling: ruling 0 is the refused text; with ruling options it is reality-eth-lib's answer string for
 * ruling − 1, for a hash question too (`0x` and 64 hex digits, or a reserved answer's label); without them it is the
 * fallback outcome. Only a uint answer is labelled with the precision (18 when absent), since only a uint answer is
 * encoded with it. A single-select without titles (absent or empty) whose label is empty reads as the ruling's decimal
 * value; the library is asked first, so reserved answers keep its label. Anything that cannot be formatted reads as the
 * ruling's decimal value, or as ruling − 1 in 64 hex digits for a hash question. Never throws.
 */
export function formatRuling(ruling: bigint, options: RulingOptions | null, fallback: FallbackOutcomes): string {
  if (ruling === 0n) return REFUSED_RULING_TEXT;
  const decimal = ruling.toString();
  if (!isUint256(ruling)) return decimal;
  if (options === null) return fallbackOutcome(ruling, fallback) ?? decimal;
  const decimals = options.type === "uint" ? (options.precision ?? DEFAULT_UINT_PRECISION) : undefined;
  const label = answerString({ type: options.type, decimals, outcomes: options.titles }, ruling - 1n);
  if (options.type === "hash") return label ?? toHexWord(ruling - 1n);
  if (label === "" && isTitleLessSelect(options)) return decimal;
  return label ?? decimal;
}

function toBytes(value: bigint): Uint8Array {
  const bytes: number[] = [];
  for (let rest = value; rest > 0n; rest >>= 8n) bytes.unshift(Number(rest & 0xffn));
  return Uint8Array.from(bytes);
}

/**
 * The title of a contributed ruling code on a variable-type question: the code's bytes as UTF-8 for a string question
 * (invalid sequences read as U+FFFD, and a leading U+FEFF is kept as part of the answer), and the ruling text otherwise.
 * Never throws.
 */
export function decodeRulingCode(code: bigint, options: RulingOptions, fallback: FallbackOutcomes): string {
  if (!isUint256(code)) return code.toString();
  if (options.type === "string") return new TextDecoder("utf-8", { ignoreBOM: true }).decode(toBytes(code));
  return formatRuling(code, options, fallback);
}
