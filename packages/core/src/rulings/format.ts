import { DEFAULT_UINT_PRECISION } from "./precision";
import { isUint256 } from "../bigint";
import { NONE_OF_THE_OPTIONS_TEXT } from "./combinations";
import { answerString, isReservedAnswer, toHexWord } from "./realityLib";
import type { FallbackOutcomes, RulingOptions } from "./types";

export const REFUSED_RULING_TEXT = "Invalid / Refused to Arbitrate / Tied";

function fallbackOutcome(ruling: bigint, fallback: FallbackOutcomes): string | undefined {
  if (fallback === null || ruling > BigInt(fallback.length)) return undefined;
  return fallback[Number(ruling - 1n)];
}

function isTitleLessSelect(options: RulingOptions): boolean {
  return options.type === "single-select" && (options.titles === undefined || options.titles.length === 0);
}

/**
 * reality-eth-lib labels the empty selection "" and misreads a combination wider than the titles, so a titled
 * multiple-select names the one and reads the other as the decimal, unless the library labels that answer itself.
 * `undefined` leaves the ruling to the library.
 */
function titledMultipleSelectText(ruling: bigint, options: RulingOptions): string | undefined {
  const { type, titles } = options;
  if (type !== "multiple-select" || titles === undefined) return undefined;
  const combination = ruling - 1n;
  if (combination === 0n) return NONE_OF_THE_OPTIONS_TEXT;
  const pastCombinations = combination >> BigInt(titles.length) !== 0n;
  return pastCombinations && !isReservedAnswer(combination) ? ruling.toString() : undefined;
}

/**
 * Only a uint answer is labelled with the precision (18 when absent), since only a uint answer is encoded with it. A
 * title-less single-select whose label is empty reads as the decimal; the library is asked first, so reserved answers
 * keep its label. Never throws.
 */
export function formatRuling(ruling: bigint, options: RulingOptions | null, fallback: FallbackOutcomes): string {
  if (ruling === 0n) return REFUSED_RULING_TEXT;
  const decimal = ruling.toString();
  if (!isUint256(ruling)) return decimal;
  if (options === null) return fallbackOutcome(ruling, fallback) ?? decimal;
  const multipleSelectText = titledMultipleSelectText(ruling, options);
  if (multipleSelectText !== undefined) return multipleSelectText;
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

/** For a string question, invalid UTF-8 reads as U+FFFD and a leading U+FEFF stays part of the answer. Never throws. */
export function decodeRulingCode(code: bigint, options: RulingOptions, fallback: FallbackOutcomes): string {
  if (!isUint256(code)) return code.toString();
  if (options.type === "string") return new TextDecoder("utf-8", { ignoreBOM: true }).decode(toBytes(code));
  return formatRuling(code, options, fallback);
}
