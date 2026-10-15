import type { Address } from "../types";
import type { CanonicalIpfsPath } from "../uri/types";

/** Question types the Create form offers (spec 4.3); `int` and `string` stay unavailable. */
export type CreateQuestionType = "single-select" | "multiple-select" | "uint" | "datetime";

export interface CreateOptionDraft {
  readonly title: string;
  readonly description: string;
}

export interface CreatePartyDraft {
  readonly alias: string;
  readonly address: string;
}

/** The form as typed: every field is an untrusted string until `validateCreateInput` accepts it. */
export interface CreateDisputeDraft {
  readonly courtId: string;
  readonly votes: string;
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly questionType: CreateQuestionType;
  readonly question: string;
  /** Trimmed to the chosen option count before validation (D-08). */
  readonly options: readonly CreateOptionDraft[];
  /** Several rows (D-08). A row with both fields empty is ignored. */
  readonly parties: readonly CreatePartyDraft[];
  readonly primaryDocument: CanonicalIpfsPath | null;
}

/** A validated form. */
export interface CreateDisputeInput {
  readonly courtId: bigint;
  readonly votes: bigint;
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly questionType: CreateQuestionType;
  readonly question: string;
  /** Empty for `uint` and `datetime`. 2 to 32 entries for the select types. */
  readonly options: readonly CreateOptionDraft[];
  /** Address → alias, names kept paired with their addresses (D-08, B20). */
  readonly aliases: Readonly<Record<Address, string>>;
  readonly primaryDocument: CanonicalIpfsPath | null;
}

export type CreateFieldErrorCode =
  | "required"
  | "not-an-integer"
  | "out-of-range" // votes < 1, options outside 2..32
  | "invalid-address" // not `isAddress` (D-08)
  | "duplicate-address"
  | "alias-without-address"
  | "address-without-alias"
  | "not-content-addressed"; // the primary document path failed the canonical check (B16)

export interface CreateValidationErrors {
  readonly courtId?: CreateFieldErrorCode;
  readonly votes?: CreateFieldErrorCode;
  readonly title?: CreateFieldErrorCode;
  readonly question?: CreateFieldErrorCode;
  readonly optionCount?: CreateFieldErrorCode;
  /** Indexed like `options`; `undefined` entries are valid. */
  readonly options?: readonly (CreateFieldErrorCode | undefined)[];
  /** Indexed like `parties`. */
  readonly parties?: readonly (CreateFieldErrorCode | undefined)[];
  readonly primaryDocument?: CreateFieldErrorCode;
}

export type CreateValidation = { readonly ok: true; readonly value: CreateDisputeInput } | { readonly ok: false; readonly errors: CreateValidationErrors };

/** The meta-evidence the Create page uploads with role `policy` (spec 4.5 step 4). */
export interface CreatedMetaEvidence {
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly aliases: Readonly<Record<Address, string>>;
  readonly question: string;
  readonly rulingOptions: { readonly type: CreateQuestionType; readonly titles: readonly string[]; readonly descriptions: readonly string[] };
  /** `""` without a document. */
  readonly fileURI: CanonicalIpfsPath | "";
  /** Always `/ipfs/<defaultScriptCid>`. */
  readonly dynamicScriptURI: CanonicalIpfsPath;
}

/** Field limits shown by the form and recorded in the Create parity snapshot (04 §1 `optionRange`, `requiredFields`). */
export interface CreateLimits {
  readonly optionRange: readonly [number, number];
  readonly minVotes: number;
  readonly requiredFields: readonly ("courtId" | "votes" | "title" | "questionType" | "optionCount" | "question" | "optionTitles")[];
}
