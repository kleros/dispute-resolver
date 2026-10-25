import { CREATE_LIMITS, encodeExtraData, normalizeIpfsPath, type CreateDisputeDraft, type CreateOptionDraft, type CreateQuestionType, type Hex } from "@dispute-resolver/core";
import type { UploadedFile } from "../../atlas";

/** `key` is a stable React key, never written anywhere. */
export interface PartyRow {
  readonly key: number;
  readonly alias: string;
  readonly address: string;
}

/**
 * `options` always holds exactly the rows shown: one per chosen option for the select types, none for `uint` and
 * `datetime`.
 */
export interface CreateForm {
  readonly courtId: string;
  readonly votes: string;
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly questionType: CreateQuestionType;
  readonly question: string;
  readonly options: readonly CreateOptionDraft[];
  readonly parties: readonly PartyRow[];
  readonly nextPartyKey: number;
  readonly primaryDocument: UploadedFile | null;
}

type TextField = "courtId" | "votes" | "category" | "title" | "description" | "question";

export const QUESTION_TYPES: readonly { readonly type: CreateQuestionType; readonly label: string }[] = [
  { type: "single-select", label: "Multiple choice: single select" },
  { type: "multiple-select", label: "Multiple choice: multiple select" },
  { type: "uint", label: "Non-negative number" },
  { type: "datetime", label: "Date" },
];

export function questionTypeLabel(type: CreateQuestionType): string {
  return QUESTION_TYPES.find((entry) => entry.type === type)?.label ?? type;
}

export function isSelectType(type: CreateQuestionType): boolean {
  return type === "single-select" || type === "multiple-select";
}

const EMPTY_OPTION: CreateOptionDraft = { title: "", description: "" };

export function initialForm(): CreateForm {
  return {
    courtId: "0",
    votes: "3",
    category: "",
    title: "",
    description: "",
    questionType: "single-select",
    question: "",
    options: [EMPTY_OPTION, EMPTY_OPTION],
    parties: [{ key: 0, alias: "", address: "" }],
    nextPartyKey: 1,
    primaryDocument: null,
  };
}

function resizeOptions(options: readonly CreateOptionDraft[], count: number): readonly CreateOptionDraft[] {
  return Array.from({ length: count }, (_, index) => options[index] ?? EMPTY_OPTION);
}

export function setText(form: CreateForm, field: TextField, value: string): CreateForm {
  return { ...form, [field]: value };
}

export function setQuestionType(form: CreateForm, questionType: CreateQuestionType): CreateForm {
  const [min] = CREATE_LIMITS.optionRange;
  return { ...form, questionType, options: isSelectType(questionType) ? resizeOptions(form.options, min) : [] };
}

/** An invalid count is ignored, so the field keeps showing the rows that will be submitted. */
export function setOptionCount(form: CreateForm, count: number): CreateForm {
  const [min, max] = CREATE_LIMITS.optionRange;
  if (!isSelectType(form.questionType) || !Number.isInteger(count) || count < min || count > max) return form;
  return { ...form, options: resizeOptions(form.options, count) };
}

export function setOption(form: CreateForm, index: number, field: keyof CreateOptionDraft, value: string): CreateForm {
  return { ...form, options: form.options.map((option, at) => (at === index ? { ...option, [field]: value } : option)) };
}

export function addParty(form: CreateForm): CreateForm {
  return { ...form, parties: [...form.parties, { key: form.nextPartyKey, alias: "", address: "" }], nextPartyKey: form.nextPartyKey + 1 };
}

export function removeParty(form: CreateForm, key: number): CreateForm {
  return { ...form, parties: form.parties.filter((party) => party.key !== key) };
}

export function setParty(form: CreateForm, key: number, field: "alias" | "address", value: string): CreateForm {
  return { ...form, parties: form.parties.map((party) => (party.key === key ? { ...party, [field]: value } : party)) };
}

export function canonicalDocument(file: UploadedFile): UploadedFile | null {
  const path = normalizeIpfsPath(file.path);
  return path === null ? null : { path, fileName: file.fileName };
}

export function setPrimaryDocument(form: CreateForm, primaryDocument: UploadedFile | null): CreateForm {
  return { ...form, primaryDocument };
}

export function toDraft(form: CreateForm): CreateDisputeDraft {
  return {
    courtId: form.courtId,
    votes: form.votes,
    category: form.category,
    title: form.title,
    description: form.description,
    questionType: form.questionType,
    question: form.question,
    options: form.options,
    parties: form.parties.map(({ alias, address }) => ({ alias, address })),
    primaryDocument: form.primaryDocument?.path ?? null,
  };
}

const DECIMAL = /^\d+$/;
const UINT256_DIGITS = 78;

function costInput(value: string, min: bigint): bigint | undefined {
  if (!DECIMAL.test(value) || value.length > UINT256_DIGITS) return undefined;
  const parsed = BigInt(value);
  return parsed >= min && parsed < 2n ** 256n ? parsed : undefined;
}

export function formExtraData(form: Pick<CreateForm, "courtId" | "votes">): Hex | undefined {
  const court = costInput(form.courtId, 0n);
  const votes = costInput(form.votes, BigInt(CREATE_LIMITS.minVotes));
  return court === undefined || votes === undefined ? undefined : encodeExtraData(court, votes);
}
