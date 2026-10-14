import { validateCreateInput, type ChainConfig, type CreateDisputeInput, type CreateValidationErrors } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Notice } from "../../ui";
import { CourtSection, type SectionProps } from "./CourtSection";
import { toDraft, type CreateForm as Form } from "./draft";
import { DocumentSection, PartiesSection } from "./PartiesSection";
import { DisputeSection, QuestionSection } from "./QuestionSection";

const NO_ERRORS: CreateValidationErrors = {};

export interface CreateFormProps {
  readonly chain: ChainConfig;
  readonly form: Form;
  readonly onChange: SectionProps["onChange"];
  readonly onContinue: (input: CreateDisputeInput) => void;
}

/**
 * Page 1 (spec §4.3): the form, validated by core on Continue (D-08, B16, B20). Errors appear after the first Continue
 * and follow the input from then on; the first invalid field takes the focus.
 */
export function CreateForm({ chain, form, onChange, onContinue }: CreateFormProps) {
  const [attempted, setAttempted] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const headingId = useId();
  const validation = validateCreateInput(toDraft(form));
  const errors = attempted && !validation.ok ? validation.errors : NO_ERRORS;

  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true'], [data-invalid] button")?.focus();
  }, [focusRequest]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validation.ok) {
      onContinue(validation.value);
      return;
    }
    setAttempted(true);
    setFocusRequest((count) => count + 1);
  };

  const sectionProps: SectionProps = { chain, form, errors, onChange };
  return (
    <form ref={formRef} noValidate aria-labelledby={headingId} className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-klerosUIComponentsSecondaryText">Fill up the form to</p>
        <h1 id={headingId} className="text-2xl font-semibold text-klerosUIComponentsPrimaryText">
          Create a custom dispute
        </h1>
      </header>
      <CourtSection {...sectionProps} />
      <DisputeSection {...sectionProps} />
      <QuestionSection {...sectionProps} />
      <PartiesSection {...sectionProps} />
      <DocumentSection {...sectionProps} />
      {attempted && !validation.ok ? <Notice variant="error" title="Some fields need attention" body="Correct the highlighted fields to continue." /> : null}
      <Button type="submit" text="Continue" className="self-end" />
    </form>
  );
}
