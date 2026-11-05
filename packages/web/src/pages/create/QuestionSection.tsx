import { CREATE_LIMITS, NONE_OF_THE_OPTIONS_TEXT } from "@dispute-resolver/core";
import { DropdownSelect, NumberField, TextArea, TextField } from "@kleros/ui-components-library";
import type { SectionProps } from "./CourtSection";
import { QUESTION_TYPES, isSelectType, setOption, setOptionCount, setQuestionType, setText } from "./draft";
import { FULL_WIDTH_FIELD, FULL_WIDTH_SELECT, FieldSlot, FormGroup, errorProps } from "./fields";
import { fieldErrorMessage } from "./messages";

const QUESTION_TYPE_ITEMS = QUESTION_TYPES.map(({ type, label }) => ({ id: type, text: label }));
const [MIN_OPTIONS, MAX_OPTIONS] = CREATE_LIMITS.optionRange;

export function DisputeSection({ form, errors, onChange }: SectionProps) {
  return (
    <FormGroup title="Dispute" description="What the dispute is about, as jurors will first read it.">
      <FieldSlot>
        <TextField
          label="Title"
          isRequired
          validationBehavior="aria"
          value={form.title}
          onChange={(value) => {
            onChange((current) => setText(current, "title", value));
          }}
          className={FULL_WIDTH_FIELD}
          {...errorProps(errors.title === undefined ? undefined : fieldErrorMessage("title", errors.title))}
        />
      </FieldSlot>
      <FieldSlot>
        <TextArea
          label="Description (Optional)"
          value={form.description}
          onChange={(value) => {
            onChange((current) => setText(current, "description", value));
          }}
          resizeY
          className={FULL_WIDTH_FIELD}
          inputProps={{ rows: 5, className: "w-full h-32" }}
        />
      </FieldSlot>
    </FormGroup>
  );
}

const OPTION_ROW_CLASS = "grid grid-cols-1 gap-3 max-lg:py-4 max-lg:first:pt-0 max-lg:last:pb-0 lg:grid-cols-2";

/**
 * Ruling 1 of every multiple-select dispute, nothing ticked, labelled with its number as the summary and the case page
 * label it: shown only, never part of the draft, the option count or the uploaded titles. Read-only rather than disabled,
 * so Tab still reaches it and it is announced. The library tints a field on hover with an `!important` rule, so the
 * locked field takes no pointer events.
 */
function NoneOfTheOptionsRow() {
  return (
    <li className={OPTION_ROW_CLASS}>
      <FieldSlot>
        <TextField
          label="Ruling Option 1"
          value={NONE_OF_THE_OPTIONS_TEXT}
          isReadOnly
          className={FULL_WIDTH_FIELD}
          inputProps={{ className: "pointer-events-none bg-klerosUIComponentsLightGrey text-klerosUIComponentsSecondaryText" }}
        />
      </FieldSlot>
    </li>
  );
}

/** A to Z, then AA, AB and on, for as many rows as the form allows. */
export function optionLetter(index: number): string {
  const letter = String.fromCodePoint(65 + (index % 26));
  return index < 26 ? letter : `${optionLetter(Math.floor(index / 26) - 1)}${letter}`;
}

/**
 * The typed rows of a multiple select are options to tick, not rulings (Blue alone is ruling 5, not 4), so they are
 * lettered and only the locked row carries a ruling number.
 */
function OptionRows({ form, errors, onChange }: Pick<SectionProps, "form" | "errors" | "onChange">) {
  const multiple = form.questionType === "multiple-select";
  const titleField = multiple ? "tickOptionTitle" : "optionTitle";
  return (
    <ol className="flex flex-col gap-4 max-lg:gap-0 max-lg:divide-y max-lg:divide-klerosUIComponentsStroke" aria-label="Ruling options">
      {multiple ? <NoneOfTheOptionsRow /> : null}
      {form.options.map((option, index) => {
        const number = String(index + 1);
        const name = multiple ? `Option ${optionLetter(index)}` : `Ruling Option ${number}`;
        const error = errors.options?.[index];
        return (
          // Rows are positional: option N is always the N-th typed row, and rows past the count are removed.
          <li key={number} className={OPTION_ROW_CLASS}>
            <FieldSlot>
              <TextField
                label={name}
                isRequired
                validationBehavior="aria"
                value={option.title}
                onChange={(value) => {
                  onChange((current) => setOption(current, index, "title", value));
                }}
                className={FULL_WIDTH_FIELD}
                {...errorProps(error === undefined ? undefined : fieldErrorMessage(titleField, error))}
              />
            </FieldSlot>
            <FieldSlot>
              <TextField
                label={`${name} Description (Optional)`}
                value={option.description}
                onChange={(value) => {
                  onChange((current) => setOption(current, index, "description", value));
                }}
                className={FULL_WIDTH_FIELD}
              />
            </FieldSlot>
          </li>
        );
      })}
    </ol>
  );
}

export function QuestionSection({ form, errors, onChange }: SectionProps) {
  const select = isSelectType(form.questionType);
  const optionCountError = errors.optionCount === undefined ? undefined : fieldErrorMessage("optionCount", errors.optionCount);
  return (
    <FormGroup title="Question and options" description="The question jurors answer, and the answers they can give.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <DropdownSelect
            label="Question Type"
            items={QUESTION_TYPE_ITEMS}
            // The library bundles a react-aria Select that only knows `selectedKey`; the newer `value` it is typed against is ignored.
            // eslint-disable-next-line @typescript-eslint/no-deprecated, sonarjs/deprecation
            selectedKey={form.questionType}
            className={FULL_WIDTH_SELECT}
            callback={(item) => {
              const type = QUESTION_TYPES.find((entry) => entry.type === item.id)?.type;
              if (type !== undefined) onChange((current) => setQuestionType(current, type));
            }}
          />
        </div>
        {select ? (
          <div className="min-w-0">
            <NumberField
              label="Number of Options"
              isRequired
              validationBehavior="aria"
              minValue={MIN_OPTIONS}
              maxValue={MAX_OPTIONS}
              step={1}
              formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
              value={form.options.length}
              onChange={(value) => {
                onChange((current) => setOptionCount(current, value));
              }}
              className={FULL_WIDTH_FIELD}
              {...errorProps(optionCountError)}
            />
          </div>
        ) : null}
      </div>
      <FieldSlot>
        <TextField
          label="Question"
          isRequired
          validationBehavior="aria"
          value={form.question}
          onChange={(value) => {
            onChange((current) => setText(current, "question", value));
          }}
          className={FULL_WIDTH_FIELD}
          {...errorProps(errors.question === undefined ? undefined : fieldErrorMessage("question", errors.question))}
        />
      </FieldSlot>
      {select ? <OptionRows form={form} errors={errors} onChange={onChange} /> : null}
    </FormGroup>
  );
}
