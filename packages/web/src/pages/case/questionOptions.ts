import { asQuestionType, type QuestionType } from "@dispute-resolver/core";

const QUESTION_TYPE_LABELS: Readonly<Record<QuestionType, string>> = {
  "single-select": "Multiple choice: single select",
  "multiple-select": "Multiple choice: multiple select",
  uint: "Non-negative number",
  int: "Number",
  string: "Text",
  datetime: "Date",
  hash: "Hash",
};

export function questionTypeLabel(type: string): string | null {
  const known = asQuestionType(type);
  return known === null ? null : QUESTION_TYPE_LABELS[known];
}
