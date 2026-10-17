import type { QuestionType, VariableQuestionType } from "./types";

const QUESTION_TYPES: ReadonlySet<string> = new Set<QuestionType>(["single-select", "multiple-select", "uint", "int", "string", "datetime", "hash"]);

const VARIABLE_TYPES: ReadonlySet<string> = new Set<VariableQuestionType>(["uint", "int", "string", "datetime", "hash"]);

/** Narrows a `rulingOptions.type` to a question type the app understands (spec 5.13), or `null` for any other string. */
export function asQuestionType(type: string): QuestionType | null {
  return QUESTION_TYPES.has(type) ? (type as QuestionType) : null;
}

/** Whether a question's answers are free values rather than listed options (spec 5.12 item 6, D-04). */
export function isVariableType(type: string): type is VariableQuestionType {
  return VARIABLE_TYPES.has(type);
}
