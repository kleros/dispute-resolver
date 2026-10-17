import type { EmptyStateProps } from "./types";

/** A section with nothing to show, such as "There are no open disputes." (spec 3) or no evidence yet (spec 5.14). */
export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-base border border-dashed border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground px-6 py-10 text-center [overflow-wrap:anywhere]">
      <p className="text-base font-semibold text-klerosUIComponentsPrimaryText">{title}</p>
      {body === undefined ? null : <p className="text-sm text-klerosUIComponentsSecondaryText">{body}</p>}
    </div>
  );
}
