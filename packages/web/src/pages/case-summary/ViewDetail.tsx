import type { Outcome, Unavailable } from "@dispute-resolver/core";
import type { ReactNode } from "react";
import { SectionSkeleton, useRevealIn } from "../../ui";
import type { SectionData } from "../../data";
import { viewField, type ExistingView } from "./caseState";

/** Core's reason replaces the value: a failed field never shows stand-in data. */
function UnavailableValue({ error }: { readonly error: Unavailable }) {
  return <span className="text-sm font-normal text-klerosUIComponentsSecondaryText [overflow-wrap:anywhere]">{`Unavailable: ${error.message}`}</span>;
}

/** A detail's value while its read is pending. */
export function DetailPlaceholder() {
  return (
    <div className="w-32 max-w-full">
      <SectionSkeleton variant="text" lines={1} />
    </div>
  );
}

interface ViewDetailProps<T> {
  readonly view: SectionData<ExistingView>;
  /** The field of the view this detail shows; each degrades on its own. */
  readonly pick: (view: ExistingView) => Outcome<T>;
  readonly children: (value: T) => ReactNode;
}

export function ViewDetail<T>({ view, pick, children }: ViewDetailProps<T>) {
  const field = viewField(view, pick);
  const reveal = useRevealIn(field.status === "loading");
  switch (field.status) {
    case "loading":
      return <DetailPlaceholder />;
    case "unavailable":
      return <UnavailableValue error={field.error} />;
    case "ready":
      return <span className={reveal}>{children(field.value)}</span>;
  }
}
