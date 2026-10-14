import type { AnswerInput, VariableQuestionType } from "@dispute-resolver/core";
import { now, type DateValue } from "@internationalized/date";
import { Datepicker, TextField } from "@kleros/ui-components-library";
import { useState } from "react";
import { pickedTimestamp } from "./answer";
import { FREE_INPUT_PLACEHOLDER } from "./copy";

type TextAnswerType = Exclude<VariableQuestionType, "datetime">;

const TEXT_LABELS: Readonly<Record<TextAnswerType, string>> = {
  uint: "Answer (zero or a positive number)",
  int: "Answer (whole number)",
  string: "Answer (text)",
  hash: "Answer (hash)",
};

/** A decimal keypad where the answer is a non-negative number; `int` keeps the full keyboard for the minus sign. */
const INPUT_MODES: Readonly<Record<TextAnswerType, "decimal" | "text">> = { uint: "decimal", int: "text", string: "text", hash: "text" };

export interface AnswerFieldProps {
  readonly type: VariableQuestionType;
  /** The typed answer, or `null` while there is none (a cleared date). */
  readonly onChange: (answer: AnswerInput | null) => void;
  /** Why the answer cannot be encoded (WN-3). */
  readonly error: string | undefined;
}

/**
 * The free input of a variable-type card (spec §5.12): a text field whose raw text core encodes and validates (uint,
 * int, string, hash), or a date and time picker in UTC whose chosen time is kept (D-17).
 */
export function AnswerField({ type, onChange, error }: AnswerFieldProps) {
  return type === "datetime" ? <DateAnswerField onChange={onChange} error={error} /> : <TextAnswerField type={type} onChange={onChange} error={error} />;
}

function TextAnswerField({ type, onChange, error }: { readonly type: TextAnswerType } & Omit<AnswerFieldProps, "type">) {
  const [text, setText] = useState("");
  return (
    <TextField
      className="w-full"
      label={TEXT_LABELS[type]}
      placeholder={FREE_INPUT_PLACEHOLDER}
      value={text}
      inputProps={{ inputMode: INPUT_MODES[type], autoComplete: "off", spellCheck: false }}
      isInvalid={error !== undefined}
      variant={error === undefined ? undefined : "error"}
      message={error}
      onChange={(value) => {
        setText(value);
        onChange({ type, value });
      }}
    />
  );
}

/**
 * The date picker starts empty, so the card has no answer until one is picked (spec §5.12). Picking a day commits it at
 * once, at 00:00 UTC unless a time is set: the library's Select button closes the popover without committing a day
 * picked on an empty field, so waiting for it would drop the choice. The time stays adjustable afterwards (D-17).
 */
function DateAnswerField({ onChange, error }: Omit<AnswerFieldProps, "type">) {
  const [value, setValue] = useState<DateValue | null>(null);
  const [placeholder] = useState(() => now("UTC").set({ hour: 0, minute: 0, second: 0, millisecond: 0 }));
  return (
    <div className="flex min-w-0 flex-col gap-1 [&_[role=group]]:w-full [&_[role=group]]:min-w-0">
      <Datepicker
        time
        shouldCloseOnSelect
        label="Answer (date and time, UTC)"
        value={value}
        defaultValue={null}
        placeholderValue={placeholder}
        isInvalid={error !== undefined}
        onChange={(next) => {
          setValue(next);
          onChange(next === null ? null : { type: "datetime", timestamp: pickedTimestamp(next) });
        }}
      />
      {error === undefined ? null : <p className="text-sm text-klerosUIComponentsError">{error}</p>}
    </div>
  );
}
