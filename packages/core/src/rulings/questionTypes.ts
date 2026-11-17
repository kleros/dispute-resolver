import type { QuestionType, VariableQuestionType } from "./types";

const QUESTION_TYPES: ReadonlySet<string> = new Set<QuestionType>(["single-select", "multiple-select", "uint", "int", "string", "datetime", "hash"]);

const VARIABLE_TYPES: ReadonlySet<string> = new Set<VariableQuestionType>(["uint", "int", "string", "datetime", "hash"]);

export function asQuestionType(type: string): QuestionType | null {
  return QUESTION_TYPES.has(type) ? (type as QuestionType) : null;
}

export function isVariableType(type: string): type is VariableQuestionType {
  return VARIABLE_TYPES.has(type);
}
