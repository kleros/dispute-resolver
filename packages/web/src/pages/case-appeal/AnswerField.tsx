import type { AnswerInput, VariableQuestionType } from "@dispute-resolver/core";
import { today, type DateValue } from "@internationalized/date";
import { Datepicker, TextField } from "@kleros/ui-components-library";
import { useId, useState } from "react";
import { pickedTimestamp } from "./answer";
import { DATE_FROM_1970, FREE_INPUT_PLACEHOLDER } from "./copy";

type TextAnswerType = Exclude<VariableQuestionType, "datetime">;

const TEXT_LABELS: Readonly<Record<TextAnswerType, string>> = {
  uint: "Answer (zero or a positive number)",
  int: "Answer (whole number)",
  string: "Answer (text)",
  hash: "Answer (hash)",
};

/** A decimal keypad where the answer is a non-negative number; `int` keeps the full keyboard for the minus sign. */
const INPUT_MODES: Readonly<Record<TextAnswerType, "decimal" | "text">> = { uint: "decimal", int: "text", string: "text", hash: "text" };

interface AnswerFieldProps {
  readonly type: VariableQuestionType;
  /** The typed answer, or `null` while there is none (a cleared date). */
  readonly onChange: (answer: AnswerInput | null) => void;
  readonly error: string | undefined;
}

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

/** A date before 1970 has no answer to fund; the field passes through such dates while its year is typed (2, 20, 202). */
function fundableDate(value: DateValue | null): AnswerInput | null {
  if (value === null) return null;
  const timestamp = pickedTimestamp(value);
  return timestamp < 0 ? null : { type: "datetime", timestamp };
}

/**
 * A date without a time of day, funded as midnight UTC of the chosen date in every browser zone. The placeholder is a
 * date without a zone, so a typed date is one too. `defaultValue` is what the library's Clear button sets, and the
 * library's own default is the current time in the browser's zone, so it stays empty. A date before 1970 counts as no
 * answer and is explained only once focus has left the field and its calendar.
 */
function DateAnswerField({ onChange, error }: Omit<AnswerFieldProps, "type">) {
  const [value, setValue] = useState<DateValue | null>(null);
  const [placeholder] = useState(() => today("UTC"));
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const message = !focused && !open && value !== null && fundableDate(value) === null ? DATE_FROM_1970 : error;
  const messageId = useId();
  return (
    <div className="flex min-w-0 flex-col [&_[role=group]]:w-full [&_[role=group]]:min-w-0">
      <Datepicker
        shouldCloseOnSelect
        label="Answer (date, UTC)"
        aria-describedby={messageId}
        value={value}
        defaultValue={null}
        placeholderValue={placeholder}
        isInvalid={message !== undefined}
        onFocusChange={setFocused}
        onOpenChange={setOpen}
        onChange={(next) => {
          setValue(next);
          onChange(fundableDate(next));
        }}
      />
      {/* Mounted while empty, so the message is announced as it appears. */}
      <div id={messageId} aria-live="polite">
        {message === undefined ? null : <p className="mt-1 text-sm text-klerosUIComponentsError">{message}</p>}
      </div>
    </div>
  );
}
