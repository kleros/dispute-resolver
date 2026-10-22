import { validateCreateInput, type ChainConfig, type CreateDisputeInput, type CreateValidationErrors } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from "react";
import { EYEBROW, Notice, PAGE_TITLE } from "../../ui";
import { CourtSection, type SectionProps } from "./CourtSection";
import { toDraft, type CreateForm as Form } from "./draft";
import { DocumentSection, PartiesSection } from "./PartiesSection";
import { DisputeSection, QuestionSection } from "./QuestionSection";

const NO_ERRORS: CreateValidationErrors = {};

/** Clears a finished shake; the field's own animations bubble up here too and are ignored. */
function settleShake(event: Event): void {
  const slot = event.currentTarget;
  if (event.target === slot && slot instanceof HTMLElement) delete slot.dataset.shaking;
}

function shake(slot: HTMLElement): void {
  delete slot.dataset.shaking;
  // Reading the layout commits the removal, so setting the attribute again restarts the animation.
  slot.getBoundingClientRect();
  slot.dataset.shaking = "";
  // The same listener is added once per slot, however often the slot shakes.
  slot.addEventListener("animationend", settleShake);
}

export interface CreateFormProps {
  readonly chain: ChainConfig;
  readonly form: Form;
  readonly onChange: SectionProps["onChange"];
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly onContinue: (input: CreateDisputeInput) => void;
}

/** Errors appear after the first Continue and follow the input from then on. */
export function CreateForm({ chain, form, onChange, headingRef, onContinue }: CreateFormProps) {
  const [attempted, setAttempted] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const headingId = useId();
  const validation = validateCreateInput(toDraft(form));
  const errors = attempted && !validation.ok ? validation.errors : NO_ERRORS;

  useEffect(() => {
    if (focusRequest === 0) return;
    const form = formRef.current;
    if (form === null) return;
    form.querySelector<HTMLElement>("[aria-invalid='true'], [data-invalid] button")?.focus();
    for (const slot of form.querySelectorAll<HTMLElement>("[data-field-slot]")) {
      if (slot.querySelector("[aria-invalid='true'], [data-invalid]") !== null) shake(slot);
    }
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
        <p className={EYEBROW}>Fill up the form to</p>
        <h1 ref={headingRef} id={headingId} tabIndex={-1} className={PAGE_TITLE}>
          Create a custom dispute
        </h1>
      </header>
      <CourtSection {...sectionProps} />
      <DisputeSection {...sectionProps} />
      <QuestionSection {...sectionProps} />
      <PartiesSection {...sectionProps} />
      <DocumentSection {...sectionProps} />
      {attempted && !validation.ok ? <Notice reveal variant="error" title="Some fields need attention" body="Correct the highlighted fields to continue." /> : null}
      <Button type="submit" text="Continue" className="w-full sm:w-auto sm:self-end" />
    </form>
  );
}
