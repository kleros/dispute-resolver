import { Card } from "@kleros/ui-components-library";
import type { ReactNode } from "react";

/** `min-w-0` keeps the library's fixed-width fields inside their column. */
export function FieldSlot({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return (
    <div data-field-slot className={className === undefined ? "min-w-0" : `min-w-0 ${className}`}>
      {children}
    </div>
  );
}

export function errorProps(message: string | undefined): { readonly isInvalid?: true; readonly variant?: "error"; readonly message?: string } {
  return message === undefined ? {} : { isInvalid: true, variant: "error", message };
}

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

/** The library's fields have a fixed width; these let them fill their column. */
export const FULL_WIDTH_FIELD = "w-full min-w-0";
export const FULL_WIDTH_SELECT = "w-full min-w-0 [&_button]:w-full";
