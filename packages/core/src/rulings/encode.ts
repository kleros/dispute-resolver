import { answerToUint, hasSupportedDecimals, MAX_UINT256 } from "./realityLib";
import type { LibQuestion } from "./realityLib";
import type { AnswerEncoding, AnswerEncodingError, AnswerInput, RulingOptions } from "./types";

/** Decimals of a uint answer when the question gives none (spec 5.12). */
const DEFAULT_UINT_DECIMALS = 18;

/** reality-eth-lib's int range, `±(2²⁵⁶ − 1) / 2`. */
const MAX_INT = MAX_UINT256 / 2n;

/** A string answer is one bytes32 word. */
const MAX_STRING_BYTES = 32;

/** A decimal as ethers' FixedNumber reads it: digits with an optional point, and at least one digit ("1.", ".5"). */
const UNSIGNED_DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const INTEGER = /^-?\d+$/;

/** An isolated UTF-16 surrogate: in `u` mode a surrogate pair is one code point, so only unpaired halves match. */
const LONE_SURROGATE = /\p{Surrogate}/u;

function encoded(code: bigint): AnswerEncoding {
  return { ok: true, code };
}

function failed(error: AnswerEncodingError): AnswerEncoding {
  return { ok: false, error };
}

/** The code of a Reality answer: the answer + 1, which must stay within uint256. */
function answerPlusOne(answer: bigint): AnswerEncoding {
  return answer < MAX_UINT256 ? encoded(answer + 1n) : failed("out-of-range");
}

/** Encodes an answer through reality-eth-lib; whatever the library rejects is out of range. */
function encodeLibAnswer(value: string, question: LibQuestion, toCode: (answer: bigint) => AnswerEncoding): AnswerEncoding {
  if (!hasSupportedDecimals(question.decimals)) return failed("out-of-range");
  try {
    return toCode(answerToUint(value, question));
  } catch {
    return failed("out-of-range");
  }
}

/**
 * Drops trailing zeros of a fractional part and a trailing point, so "1.50", "1.0", "1." and ".0" encode like "1.5",
 * "1", "1" and "0" at any precision.
 */
function trimFraction(value: string): string {
  if (!value.includes(".")) return value;
  let end = value.length;
  while (value[end - 1] === "0") end -= 1;
  if (value[end - 1] === ".") end -= 1;
  return end === 0 ? "0" : value.slice(0, end);
}

/** uint: reality-eth-lib's encoding at the question's precision (default 18, 0 respected, D-15), plus 1. */
function encodeUint(value: string, precision: number | undefined): AnswerEncoding {
  if (value.length === 0) return failed("empty");
  if (!UNSIGNED_DECIMAL.test(value)) {
    return value.startsWith("-") && UNSIGNED_DECIMAL.test(value.slice(1)) ? failed("negative-uint") : failed("not-a-number");
  }
  return encodeLibAnswer(trimFraction(value), { type: "uint", decimals: precision ?? DEFAULT_UINT_DECIMALS }, answerPlusOne);
}

/** int: reality-eth-lib's two's-complement encoding over its full range, plus 1, modulo 2²⁵⁶ (D-16). */
function encodeInt(value: string): AnswerEncoding {
  if (value.length === 0) return failed("empty");
  if (!INTEGER.test(value)) return failed("not-a-number");
  const parsed = BigInt(value);
  if (parsed > MAX_INT || parsed < -MAX_INT) return failed("out-of-range");
  return encodeLibAnswer(value, { type: "int" }, (answer) => encoded((answer + 1n) & MAX_UINT256));
}

/** string: the UTF-8 bytes as an unsigned integer, with no +1, as today (spec 5.12); text with an isolated surrogate is malformed. */
function encodeString(value: string): AnswerEncoding {
  if (value.length === 0) return failed("empty");
  if (LONE_SURROGATE.test(value)) return failed("malformed");
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > MAX_STRING_BYTES) return failed("too-long");
  return encoded(bytes.reduce((code, byte) => (code << 8n) | BigInt(byte), 0n));
}

/** datetime: the chosen Unix timestamp, time of day included (D-17), plus 1. */
function encodeDatetime(timestamp: number): AnswerEncoding {
  if (!Number.isInteger(timestamp)) return failed("not-a-number");
  if (timestamp < 0 || !Number.isSafeInteger(timestamp)) return failed("out-of-range");
  return encoded(BigInt(timestamp) + 1n);
}

/**
 * hash: `BigInt(value)` plus 1, which must be a uint256 (spec 5.12). Every form BigInt reads is accepted: hex, decimal,
 * octal and binary, with surrounding whitespace trimmed.
 */
function encodeHash(value: string): AnswerEncoding {
  if (value.length === 0) return failed("empty");
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    return failed("not-hex");
  }
  return parsed < 0n ? failed("out-of-range") : answerPlusOne(parsed);
}

/**
 * The ruling code sent to `fundAppeal` for a free-input answer (spec 5.12 code table with D-15, D-16, D-17). Bad input
 * returns an error code and never throws (D-14).
 */
export function encodeAnswer(input: AnswerInput, options: RulingOptions): AnswerEncoding {
  switch (input.type) {
    case "uint":
      return encodeUint(input.value, options.precision);
    case "int":
      return encodeInt(input.value);
    case "string":
      return encodeString(input.value);
    case "datetime":
      return encodeDatetime(input.timestamp);
    case "hash":
      return encodeHash(input.value);
  }
}
