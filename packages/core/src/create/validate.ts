import { isAddress } from "viem";
import { toRegistryAddress } from "../registry";
import type { Address } from "../types";
import { normalizeIpfsPath } from "../uri";
import type { CanonicalIpfsPath } from "../uri/types";
import { CREATE_LIMITS, MAX_UINT256 } from "./limits";
import type { CreateDisputeDraft, CreateFieldErrorCode, CreateOptionDraft, CreatePartyDraft, CreateValidation } from "./types";

type Checked<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CreateFieldErrorCode };

const DECIMAL = /^\d+$/;

function valid<T>(value: T): Checked<T> {
  return { ok: true, value };
}

function invalid<T>(error: CreateFieldErrorCode): Checked<T> {
  return { ok: false, error };
}

function errorOf<T>(checked: Checked<T>): CreateFieldErrorCode | undefined {
  return checked.ok ? undefined : checked.error;
}

/** A form integer: ASCII digits only (no sign, exponent, fraction or whitespace), at least `min`, within uint256. */
function checkInteger(input: string, min: bigint): Checked<bigint> {
  if (input === "") return invalid("required");
  if (!DECIMAL.test(input)) return invalid("not-an-integer");
  const value = BigInt(input);
  return value < min || value > MAX_UINT256 ? invalid("out-of-range") : valid(value);
}

/** Today's `required` text inputs: only the empty string is missing (spec 4.3). */
function checkRequired(input: string): Checked<string> {
  return input === "" ? invalid("required") : valid(input);
}

function isSelectType(questionType: CreateDisputeDraft["questionType"]): boolean {
  return questionType === "single-select" || questionType === "multiple-select";
}

/** Select types need 2 to 32 options, each with a title (spec 4.3); other types carry none (D-08). */
function checkOptions(draft: CreateDisputeDraft): { readonly optionCount?: CreateFieldErrorCode; readonly options: readonly (CreateFieldErrorCode | undefined)[] } {
  if (!isSelectType(draft.questionType)) return { options: [] };
  const [min, max] = CREATE_LIMITS.optionRange;
  const count = draft.options.length;
  const optionCount = count < min || count > max ? "out-of-range" : undefined;
  return { ...(optionCount === undefined ? {} : { optionCount }), options: draft.options.map((option) => errorOf(checkRequired(option.title))) };
}

/**
 * One party row (D-08, B20): ignored when both fields are blank; otherwise both are needed, and the address must pass
 * `isAddress` with its EIP-55 checksum check (all-lowercase or correctly checksummed) and not repeat an earlier row's
 * (case-insensitive). The alias is kept as typed, paired with its address.
 */
function checkParty(party: CreatePartyDraft, seen: Set<Address>): Checked<readonly [Address, string] | null> {
  const address = party.address.trim();
  const hasAlias = party.alias.trim() !== "";
  if (!hasAlias && address === "") return valid(null);
  if (address === "") return invalid("alias-without-address");
  if (!isAddress(address)) return invalid("invalid-address");
  if (!hasAlias) return invalid("address-without-alias");
  const key = toRegistryAddress(address);
  if (seen.has(key)) return invalid("duplicate-address");
  seen.add(key);
  return valid([key, party.alias]);
}

/** The primary document must already be a canonical content-addressed path (B16): its own normalization. */
function checkDocument(document: CanonicalIpfsPath | null): Checked<CanonicalIpfsPath | null> {
  if (document === null) return valid(null);
  return normalizeIpfsPath(document) === document ? valid(document) : invalid("not-content-addressed");
}

function selectedOptions(draft: CreateDisputeDraft): readonly CreateOptionDraft[] {
  return isSelectType(draft.questionType) ? draft.options.map(({ title, description }) => ({ title, description })) : [];
}

/**
 * Validates the Create form (spec 4.3, D-08, B16, B20). Every invalid field is reported at once; on success the draft
 * becomes a typed input whose aliases map each party's lowercased address to its own alias.
 */
export function validateCreateInput(draft: CreateDisputeDraft): CreateValidation {
  const courtId = checkInteger(draft.courtId, 0n);
  const votes = checkInteger(draft.votes, BigInt(CREATE_LIMITS.minVotes));
  const title = checkRequired(draft.title);
  const question = checkRequired(draft.question);
  const { optionCount, options } = checkOptions(draft);
  const seen = new Set<Address>();
  const parties = draft.parties.map((party) => checkParty(party, seen));
  const partyErrors = parties.map(errorOf);
  const primaryDocument = checkDocument(draft.primaryDocument);
  const fieldsValid = optionCount === undefined && options.every((error) => error === undefined) && partyErrors.every((error) => error === undefined);

  if (courtId.ok && votes.ok && title.ok && question.ok && primaryDocument.ok && fieldsValid) {
    return {
      ok: true,
      value: {
        courtId: courtId.value,
        votes: votes.value,
        category: draft.category,
        title: title.value,
        description: draft.description,
        questionType: draft.questionType,
        question: question.value,
        options: selectedOptions(draft),
        aliases: Object.fromEntries(parties.flatMap((party) => (party.ok && party.value !== null ? [party.value] : []))),
        primaryDocument: primaryDocument.value,
      },
    };
  }

  return {
    ok: false,
    errors: {
      ...(courtId.ok ? {} : { courtId: courtId.error }),
      ...(votes.ok ? {} : { votes: votes.error }),
      ...(title.ok ? {} : { title: title.error }),
      ...(question.ok ? {} : { question: question.error }),
      ...(optionCount === undefined ? {} : { optionCount }),
      ...(options.some((error) => error !== undefined) ? { options } : {}),
      ...(partyErrors.some((error) => error !== undefined) ? { parties: partyErrors } : {}),
      ...(primaryDocument.ok ? {} : { primaryDocument: primaryDocument.error }),
    },
  };
}
