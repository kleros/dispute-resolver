/** Question types of `rulingOptions.type` the app understands (spec 5.13). */
export type QuestionType = "single-select" | "multiple-select" | "uint" | "int" | "string" | "datetime" | "hash";

/** Variable-answer types: their appeal cards are contributed values, the current ruling and a free input (D-04). */
export type VariableQuestionType = "uint" | "int" | "string" | "datetime" | "hash";

/**
 * Validated ruling options, after the sanitize rules of spec 9.1 step 9 (A7). Produced by the meta-evidence schema and
 * by the on-chain Reality derivation; consumed by decision text, the question panel, appeal cards and answer encoding.
 */
export interface RulingOptions {
  /**
   * Usually a `QuestionType`. A non-string is coerced to "single-select", but any other string is kept verbatim, as
   * today (spec 9.1 step 9); `asQuestionType` narrows it, and unknown types take the generic paths of 5.9 and 5.12.
   */
  readonly type: string;
  /** Option titles, coded 1..n (single-select) or bit positions (multiple-select). Absent means no titles were given. */
  readonly titles?: readonly string[];
  /**
   * Descriptions indexed like `titles`, and by code for reserved options (spec 9.2): a positional array, or a record keyed
   * by position (as a decimal string) or by reserved code as written. Option i is described by entry i − 1 and a reserved
   * option by its code, each only when that entry exists (spec 5.13).
   */
  readonly descriptions?: readonly string[] | Readonly<Record<string, string>>;
  /** Reserved answers keyed by their hex code, e.g. `0xFF..FF` → "Answered Too Soon". */
  readonly reserved?: Readonly<Record<string, string>>;
  /** Decimals of a uint answer; a precision of 0 is respected (D-15). */
  readonly precision?: number;
}

/** A user's answer on a free-input appeal card, before encoding into a ruling code (spec 5.12, D-15, D-16, D-17). */
export type AnswerInput =
  | { readonly type: "uint" | "int"; readonly value: string }
  | { readonly type: "string"; readonly value: string }
  | { readonly type: "hash"; readonly value: string }
  | { readonly type: "datetime"; readonly timestamp: number };

/**
 * Why an answer could not be encoded. Shown on the card; never thrown (D-14). `malformed` is a string answer that is not
 * well-formed Unicode (an isolated surrogate), which has no UTF-8 encoding.
 */
export type AnswerEncodingError = "empty" | "not-a-number" | "negative-uint" | "out-of-range" | "not-hex" | "too-long" | "malformed";

export type AnswerEncoding = { readonly ok: true; readonly code: bigint } | { readonly ok: false; readonly error: AnswerEncodingError };

/** Reality outcome titles read from legacy meta-evidence keys, the 5.9 fallback when `rulingOptions` has no titles. */
export type FallbackOutcomes = readonly string[] | null;
