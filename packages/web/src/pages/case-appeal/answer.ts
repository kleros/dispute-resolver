import { formatRuling, type AnswerEncodingError, type RulingOptions } from "@dispute-resolver/core";
import type { DateValue } from "@internationalized/date";

export const ANSWER_ERROR_MESSAGES: Readonly<Record<AnswerEncodingError, string>> = {
  empty: "Enter the answer you want to fund.",
  "not-a-number": "Enter the answer as a number written in digits, such as 42 (decimals only where the question allows them).",
  "negative-uint": "This question only accepts zero or positive numbers.",
  "out-of-range": "This answer is outside what the question can encode: it is too large, too small or has more decimals than the question allows.",
  "not-hex": "Enter the hash as a number, usually 0x followed by hexadecimal digits.",
  "too-long": "Text answers are limited to 32 bytes once encoded as UTF-8; shorten the answer.",
  malformed: "This text contains a broken character (an unpaired surrogate) and cannot be encoded; retype it.",
};

/** An int answer carries no decimals when it is encoded, so it is read back without them. */
const INT_OPTIONS: RulingOptions = { type: "int" };

/**
 * The answer as the court will show the ruling: -1 encodes to ruling 0, the refuse-to-arbitrate ruling, and -2 to
 * 2²⁵⁶ − 1, Reality's "answered too soon" answer.
 */
export function fundedIntAnswer(code: bigint): string {
  return formatRuling(code, INT_OPTIONS, null);
}

/** A value without a zone is read in UTC. */
export function pickedTimestamp(value: DateValue): number {
  const date = "timeZone" in value ? value.toDate() : value.toDate("UTC");
  return Math.floor(date.getTime() / 1000);
}
