/** Question types of `rulingOptions.type` the app understands. */
export type QuestionType = "single-select" | "multiple-select" | "uint" | "int" | "string" | "datetime" | "hash";

/** Variable-answer types: their appeal cards are contributed values, the current ruling and a free input. */
export type VariableQuestionType = "uint" | "int" | "string" | "datetime" | "hash";

/** Validated ruling options, produced by the meta-evidence schema and by the on-chain Reality derivation. */
export interface RulingOptions {
  /**
   * Usually a `QuestionType`. A non-string is coerced to "single-select", but any other string is kept verbatim;
   * `asQuestionType` narrows it, and unknown types take the generic formatting and encoding paths.
   */
  readonly type: string;
  /** Option titles, coded 1..n (single-select) or bit positions (multiple-select). Absent means no titles were given. */
  readonly titles?: readonly string[];
  /**
   * Descriptions indexed like `titles`, and by code for reserved options: a positional array, or a record keyed by
   * position (as a decimal string) or by reserved code as written. Option i is described by entry i − 1 and a reserved
   * option by its code, each only when that entry exists.
   */
  readonly descriptions?: readonly string[] | Readonly<Record<string, string>>;
  /** Reserved answers keyed by their hex code, e.g. `0xFF..FF` → "Answered Too Soon". */
  readonly reserved?: Readonly<Record<string, string>>;
  /**
   * Decimals of a uint answer for encoding and display; absent = 18 (meta-evidence default); Reality-derived options
   * always carry reality-eth-lib's reading; 0 is respected.
   */
  readonly precision?: number;
}

/** A user's answer on a free-input appeal card, before encoding into a ruling code. */
export type AnswerInput =
  | { readonly type: "uint" | "int"; readonly value: string }
  | { readonly type: "string"; readonly value: string }
  | { readonly type: "hash"; readonly value: string }
  | { readonly type: "datetime"; readonly timestamp: number };

/**
 * Why an answer could not be encoded. Shown on the card; never thrown. `malformed` is a string answer that is not
 * well-formed Unicode (an isolated surrogate), which has no UTF-8 encoding.
 */
export type AnswerEncodingError = "empty" | "not-a-number" | "negative-uint" | "out-of-range" | "not-hex" | "too-long" | "malformed";

export type AnswerEncoding = { readonly ok: true; readonly code: bigint } | { readonly ok: false; readonly error: AnswerEncodingError };

/** Reality outcome titles read from legacy meta-evidence keys, the ruling text's fallback when `rulingOptions` has no titles. */
export type FallbackOutcomes = readonly string[] | null;
