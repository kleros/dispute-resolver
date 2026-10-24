import { maxUint256 } from "viem";
import { answerToBytes32, getAnswerString, padToBytes32 } from "@reality.eth/reality-eth-lib/formatters/question.js";
import { libDecimals } from "./precision";

/** The most decimals answer encoding supports: reality-eth-lib encodes through ethers' FixedNumber, which caps them at 80. */
const MAX_ENCODE_DECIMALS = 80;

/**
 * The most decimals a numeric label is formatted with. reality-eth-lib computes `10n ** decimals` and strips trailing
 * zeros with a quadratic regex, so the cost grows fast with the precision (10,000 decimals already take tens of
 * milliseconds); up to this cap a label costs well under a millisecond. Beyond it the label is a formatting failure.
 */
const MAX_DISPLAY_DECIMALS = 1000;

/** The question types whose labels reality-eth-lib computes with the question's decimals. */
const DECIMAL_TYPES: ReadonlySet<string> = new Set(["uint", "int", "datetime"]);

/** reality-eth-lib's "Answered too soon" answer; it and the invalid answer above it are labelled without decimals. */
const ANSWERED_TOO_SOON = maxUint256 - 1n;

/** The question fields reality-eth-lib reads when it formats or encodes an answer. */
export interface LibQuestion {
  readonly type: string;
  readonly decimals?: number;
  readonly outcomes?: readonly string[];
}

/** Whether reality-eth-lib can encode an answer with these decimals. */
export function hasSupportedDecimals(decimals: number | undefined): boolean {
  return libDecimals(decimals) <= MAX_ENCODE_DECIMALS;
}

/** Whether labelling this answer makes reality-eth-lib do decimal arithmetic beyond the display cap. */
function exceedsDisplayDecimals(question: LibQuestion, answer: bigint): boolean {
  return DECIMAL_TYPES.has(question.type) && answer < ANSWERED_TOO_SOON && libDecimals(question.decimals) > MAX_DISPLAY_DECIMALS;
}

export function isUint256(value: bigint): boolean {
  return value >= 0n && value <= maxUint256;
}

/** `0x` and the value as 64 lowercase hex digits. */
export function toHexWord(value: bigint): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

/**
 * reality-eth-lib's `getAnswerString` for an answer given as a uint256, including the `""` it returns for an empty
 * selection, an empty title or a type it does not render. Returns `undefined` when the library throws, returns no
 * string (a select index without a title), or would format a numeric label with more decimals than the display cap.
 */
export function answerString(question: LibQuestion, answer: bigint): string | undefined {
  if (!isUint256(answer) || exceedsDisplayDecimals(question, answer)) return undefined;
  try {
    const label: unknown = getAnswerString(
      { type: question.type, decimals: question.decimals, outcomes: question.outcomes === undefined ? undefined : [...question.outcomes] },
      padToBytes32(answer.toString(16)),
    );
    return typeof label === "string" ? label : undefined;
  } catch {
    return undefined;
  }
}

/**
 * reality-eth-lib's `answerToBytes32` for a uint or int answer given as a decimal string, as a bigint. Throws what the
 * library throws: more fractional digits than the decimals allow, more than 80 decimals, or a value wider than 512 bits.
 */
export function answerToUint(answer: string, question: LibQuestion): bigint {
  return BigInt(answerToBytes32(answer, { type: question.type, decimals: question.decimals }));
}
