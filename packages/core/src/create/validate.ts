import { isAddress } from "viem";
import { toRegistryAddress } from "../registry";
import type { Address } from "../types";
import { normalizeIpfsPath } from "../uri";
import type { CanonicalIpfsPath } from "../uri/types";
import { CREATE_LIMITS, MAX_UINT256 } from "./limits";
import type { CreateDisputeDraft, CreateFieldErrorCode, CreateOptionDraft, CreatePartyDraft, CreateValidation } from "./types";

type Checked<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CreateFieldErrorCode };

const DECIMAL = /^\d+$/;
/** EIP-55 treats an all-uppercase hex address as valid and unchecksummed; viem's strict `isAddress` does not. */
const ALL_UPPERCASE_ADDRESS = /^0x[0-9A-F]{40}$/;

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

/** Like an HTML `required` input: only the empty string is missing, so whitespace alone counts as a value. */
function checkRequired(input: string): Checked<string> {
  return input === "" ? invalid("required") : valid(input);
}

function isSelectType(questionType: CreateDisputeDraft["questionType"]): boolean {
  return questionType === "single-select" || questionType === "multiple-select";
}

function checkOptions(draft: CreateDisputeDraft): { readonly optionCount?: CreateFieldErrorCode; readonly options: readonly (CreateFieldErrorCode | undefined)[] } {
  if (!isSelectType(draft.questionType)) return { options: [] };
  const [min, max] = CREATE_LIMITS.optionRange;
  const count = draft.options.length;
  const optionCount = count < min || count > max ? "out-of-range" : undefined;
  return { ...(optionCount === undefined ? {} : { optionCount }), options: draft.options.map((option) => errorOf(checkRequired(option.title))) };
}

function checkParty(party: CreatePartyDraft, seen: Set<Address>): Checked<readonly [Address, string] | null> {
  const address = party.address.trim();
  const hasAlias = party.alias.trim() !== "";
  if (!hasAlias && address === "") return valid(null);
  if (address === "") return invalid("alias-without-address");
  if (!isAddress(address) && !ALL_UPPERCASE_ADDRESS.test(address)) return invalid("invalid-address");
  if (!hasAlias) return invalid("address-without-alias");
  const key = toRegistryAddress(address);
  if (seen.has(key)) return invalid("duplicate-address");
  seen.add(key);
  return valid([key, party.alias]);
}

/** The path must already be canonical: equal to its own normalization. */
function checkDocument(document: CanonicalIpfsPath | null): Checked<CanonicalIpfsPath | null> {
  if (document === null) return valid(null);
  return normalizeIpfsPath(document) === document ? valid(document) : invalid("not-content-addressed");
}

function selectedOptions(draft: CreateDisputeDraft): readonly CreateOptionDraft[] {
  return isSelectType(draft.questionType) ? draft.options.map(({ title, description }) => ({ title, description })) : [];
}

/** Reports every invalid field at once. */
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
