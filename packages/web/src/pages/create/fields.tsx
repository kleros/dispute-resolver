import { Card } from "@kleros/ui-components-library";
import type { ReactNode } from "react";

/** A form field's grid cell: `min-w-0` keeps the library's fixed-width fields inside their column (ARCHITECTURE.md §11.1). */
export function FieldSlot({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return <div className={className === undefined ? "min-w-0" : `min-w-0 ${className}`}>{children}</div>;
}

/** The library field props that show a validation message, or none. */
export function errorProps(message: string | undefined): { readonly isInvalid?: true; readonly variant?: "error"; readonly message?: string } {
  return message === undefined ? {} : { isInvalid: true, variant: "error", message };
}

/** A titled group of fields (ARCHITECTURE.md §11.5): Court and cost; Dispute; Question and options; Parties; Primary document. */
export function FormGroup({ title, description, children }: { readonly title: string; readonly description?: string; readonly children: ReactNode }) {
  return (
    <Card round className="h-auto w-full min-w-0 p-4 lg:p-6">
      <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <legend className="float-left mb-0 w-full p-0">
          <h2 className="text-xl font-semibold text-klerosUIComponentsPrimaryText">{title}</h2>
          {description === undefined ? null : <p className="mt-1 text-sm text-klerosUIComponentsSecondaryText">{description}</p>}
        </legend>
        {children}
      </fieldset>
    </Card>
  );
}

/** Class names that let the library's fixed-width fields fill their column (ARCHITECTURE.md §11.1: usable at every width). */
export const FULL_WIDTH_FIELD = "w-full min-w-0";
export const FULL_WIDTH_SELECT = "w-full min-w-0 [&_button]:w-full";
