import { CREATE_LIMITS, type CreateLimits } from "@dispute-resolver/core";
import { Box } from "@kleros/ui-components-library";
import type { ReactNode } from "react";
import { fieldAttributes } from "../../parity";

/** The `data-field` names of the form's wrappers (04 §1 `validation.requiredFields`): core's required fields and the optional ones. */
export type FieldName = CreateLimits["requiredFields"][number] | "category" | "description" | "optionDescriptions" | "partyAliases" | "partyAddresses" | "primaryDocument";

/**
 * A form field's wrapper with its parity hook (ARCHITECTURE.md §12.2): the library fields drop `data-*` props (S-1), so
 * the hook sits on this `div`. `data-required` is set exactly for core's required fields.
 */
export function FieldSlot({ name, className, children }: { readonly name: FieldName; readonly className?: string; readonly children: ReactNode }) {
  const required = (CREATE_LIMITS.requiredFields as readonly string[]).includes(name);
  return (
    <div {...fieldAttributes({ field: name, required })} className={className === undefined ? "min-w-0" : `min-w-0 ${className}`}>
      {children}
    </div>
  );
}

/** The library field props that show a validation message, or none. */
export function errorProps(message: string | undefined): { readonly isInvalid?: true; readonly variant?: "error"; readonly message?: string } {
  return message === undefined ? {} : { isInvalid: true, variant: "error", message };
}

/** A titled group of fields (ARCHITECTURE.md §11.5): Court and cost; Dispute; Question and options; Parties; Primary document. */
export function FormGroup({ title, description, children }: { readonly title: string; readonly description?: string; readonly children: ReactNode }) {
  return (
    <Box className="h-auto w-full min-w-0 p-4 lg:p-6">
      <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <legend className="float-left mb-0 w-full p-0">
          <h2 className="text-lg font-semibold text-klerosUIComponentsPrimaryText">{title}</h2>
          {description === undefined ? null : <p className="mt-1 text-sm text-klerosUIComponentsSecondaryText">{description}</p>}
        </legend>
        {children}
      </fieldset>
    </Box>
  );
}

/** Class names that let the library's fixed-width fields fill their column (ARCHITECTURE.md §11.1: usable at every width). */
export const FULL_WIDTH_FIELD = "w-full min-w-0";
export const FULL_WIDTH_SELECT = "w-full min-w-0 [&_button]:w-full";
