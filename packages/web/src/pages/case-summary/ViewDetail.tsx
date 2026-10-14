import type { Outcome, Unavailable } from "@dispute-resolver/core";
import type { ReactNode } from "react";
import { SectionSkeleton } from "../../ui";
import type { SectionData } from "../../data";
import { viewField, type ExistingView } from "./caseState";

/** A field that failed on its own, shown with core's reason in place of the value (D-36: no fake data). */
function UnavailableValue({ error }: { readonly error: Unavailable }) {
  return <span className="text-sm font-normal text-klerosUIComponentsSecondaryText [overflow-wrap:anywhere]">{`Unavailable: ${error.message}`}</span>;
}

interface ViewDetailProps<T> {
  readonly view: SectionData<ExistingView>;
  /** The field of the view this detail shows; each degrades on its own (D-36). */
  readonly pick: (view: ExistingView) => Outcome<T>;
  readonly children: (value: T) => ReactNode;
}

/** One value of the info row: a one-line placeholder while the view loads, the value, or why it is unavailable. */
export function ViewDetail<T>({ view, pick, children }: ViewDetailProps<T>) {
  const field = viewField(view, pick);
  switch (field.status) {
    case "loading":
      return (
        <div className="w-32 max-w-full">
          <SectionSkeleton variant="text" lines={1} />
        </div>
      );
    case "unavailable":
      return <UnavailableValue error={field.error} />;
    case "ready":
      return <>{children(field.value)}</>;
  }
}
