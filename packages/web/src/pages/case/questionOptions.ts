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

export function hiddenAnswersLine(count: number): string {
  return count === 1
    ? "The case's description also lists an answer the contract does not accept, so it is not shown."
    : `The case's description also lists ${String(count)} answers the contract does not accept, so they are not shown.`;
}
