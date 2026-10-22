import type { Address } from "../types";
import type { CanonicalIpfsPath } from "../uri/types";

/** `int` and `string` are deliberately not offered. */
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
  /** Trimmed to the chosen option count before validation. */
  readonly options: readonly CreateOptionDraft[];
  /** A row with both fields empty is ignored. */
  readonly parties: readonly CreatePartyDraft[];
  readonly primaryDocument: CanonicalIpfsPath | null;
}

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
  /** Lowercased address → alias. */
  readonly aliases: Readonly<Record<Address, string>>;
  readonly primaryDocument: CanonicalIpfsPath | null;
}

export type CreateFieldErrorCode =
  | "required"
  | "not-an-integer"
  | "out-of-range" // votes < 1, options outside 2..32
  | "invalid-address" // not all-lowercase, all-uppercase or EIP-55 checksummed `0x` + 40 hex
  | "duplicate-address"
  | "alias-without-address"
  | "address-without-alias"
  | "not-content-addressed"; // the primary document path failed the canonical check

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

/** Uploaded with role `policy`. */
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

export interface CreateLimits {
  readonly optionRange: readonly [number, number];
  readonly minVotes: number;
}
