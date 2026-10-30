import { CREATE_LIMITS, z, type CreateQuestionType } from "@dispute-resolver/core";
import { canonicalDocument, initialForm, isSelectType, QUESTION_TYPES, resizeOptions, type CreateForm } from "./draft";

/** Per chain, since court IDs differ from one chain to the next. */
function storageKey(chainId: number): string {
  return `dr-create-draft:${String(chainId)}`;
}

const [firstType, ...otherTypes] = QUESTION_TYPES.map((entry) => entry.type);
if (firstType === undefined) throw new Error("The Create form has no question type.");
const questionTypes: [CreateQuestionType, ...CreateQuestionType[]] = [firstType, ...otherTypes];

/** Only the uploaded document's IPFS path and display name are kept, never the file itself. */
const storedDraftSchema = z.strictObject({
  version: z.literal(1),
  courtId: z.string(),
  votes: z.string(),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  questionType: z.enum(questionTypes),
  question: z.string(),
  options: z.array(z.strictObject({ title: z.string(), description: z.string() })).max(CREATE_LIMITS.optionRange[1]),
  parties: z.array(z.strictObject({ alias: z.string(), address: z.string() })),
  primaryDocument: z.strictObject({ path: z.string(), fileName: z.string() }).nullable(),
});

type StoredDraft = z.infer<typeof storedDraftSchema>;

function toStored(form: CreateForm): StoredDraft {
  return {
    version: 1,
    courtId: form.courtId,
    votes: form.votes,
    category: form.category,
    title: form.title,
    description: form.description,
    questionType: form.questionType,
    question: form.question,
    options: form.options.map(({ title, description }) => ({ title, description })),
    parties: form.parties.map(({ alias, address }) => ({ alias, address })),
    primaryDocument: form.primaryDocument === null ? null : { path: form.primaryDocument.path, fileName: form.primaryDocument.fileName },
  };
}

function fromStored(stored: StoredDraft): CreateForm {
  const [min] = CREATE_LIMITS.optionRange;
  const parties = stored.parties.length === 0 ? initialForm().parties : stored.parties.map(({ alias, address }, key) => ({ key, alias, address }));
  return {
    courtId: stored.courtId,
    votes: stored.votes,
    category: stored.category,
    title: stored.title,
    description: stored.description,
    questionType: stored.questionType,
    question: stored.question,
    options: isSelectType(stored.questionType) ? resizeOptions(stored.options, Math.max(min, stored.options.length)) : [],
    parties,
    nextPartyKey: parties.length,
    primaryDocument: stored.primaryDocument === null ? null : canonicalDocument(stored.primaryDocument),
  };
}

const INITIAL_STORED = JSON.stringify(toStored(initialForm()));

/** Whether the form holds nothing the user entered: such a form is never stored. */
export function isInitialForm(form: CreateForm): boolean {
  return JSON.stringify(toStored(form)) === INITIAL_STORED;
}

export function clearCreateDraft(chainId: number): void {
  try {
    window.localStorage.removeItem(storageKey(chainId));
  } catch {
    // Storage is unavailable; whatever it holds is validated again on the next restore.
  }
}

/** A storage failure only means the form lives for this page only. */
export function storeCreateDraft(chainId: number, form: CreateForm): void {
  const text = JSON.stringify(toStored(form));
  try {
    if (text === INITIAL_STORED) window.localStorage.removeItem(storageKey(chainId));
    else window.localStorage.setItem(storageKey(chainId), text);
  } catch {
    // Storage is unavailable (blocked, private mode, quota).
  }
}

/** A draft that does not parse is removed, never repaired. */
export function restoreCreateDraft(chainId: number): CreateForm | null {
  let text: string | null;
  try {
    text = window.localStorage.getItem(storageKey(chainId));
  } catch {
    return null;
  }
  if (text === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = undefined;
  }
  const parsed = storedDraftSchema.safeParse(raw);
  if (parsed.success) return fromStored(parsed.data);
  clearCreateDraft(chainId);
  return null;
}
