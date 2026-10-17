import { CREATE_LIMITS } from "@dispute-resolver/core";
import { DropdownSelect, NumberField, TextArea, TextField } from "@kleros/ui-components-library";
import type { SectionProps } from "./CourtSection";
import { QUESTION_TYPES, isSelectType, setOption, setOptionCount, setQuestionType, setText } from "./draft";
import { FULL_WIDTH_FIELD, FULL_WIDTH_SELECT, FieldSlot, FormGroup, errorProps } from "./fields";
import { fieldErrorMessage } from "./messages";

const QUESTION_TYPE_ITEMS = QUESTION_TYPES.map(({ type, label }) => ({ id: type, text: label }));
const [MIN_OPTIONS, MAX_OPTIONS] = CREATE_LIMITS.optionRange;

/** Title and description (spec §4.3). */
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

function OptionRows({ form, errors, onChange }: Pick<SectionProps, "form" | "errors" | "onChange">) {
  return (
    <ol className="flex flex-col gap-4 max-lg:gap-0 max-lg:divide-y max-lg:divide-klerosUIComponentsStroke" aria-label="Ruling options">
      {form.options.map((option, index) => {
        const number = String(index + 1);
        const error = errors.options?.[index];
        return (
          // Rows are positional: option N is always the N-th row, and rows past the count are removed (D-08).
          <li key={number} className="grid grid-cols-1 gap-3 max-lg:py-4 max-lg:first:pt-0 max-lg:last:pb-0 lg:grid-cols-2">
            <FieldSlot>
              <TextField
                label={`Ruling Option ${number}`}
                isRequired
                validationBehavior="aria"
                value={option.title}
                onChange={(value) => {
                  onChange((current) => setOption(current, index, "title", value));
                }}
                className={FULL_WIDTH_FIELD}
                {...errorProps(error === undefined ? undefined : fieldErrorMessage("optionTitle", error))}
              />
            </FieldSlot>
            <FieldSlot>
              <TextField
                label={`Ruling Option ${number} Description (Optional)`}
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

/** Question type, number of options, question and the ruling options (spec §4.3, D-08). */
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
