import type { EmptyStateProps } from "./types";

const FIRST_LINE = "animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_backwards] motion-reduce:animate-none";
const NEXT_LINE = "animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_var(--stagger-stagger)_backwards] motion-reduce:animate-none";

/** A section with nothing to show, such as "There are no open disputes." or no evidence yet, with an optional next step. */
export function EmptyState({ title, body, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-base border border-dashed border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground px-6 py-10 text-center [overflow-wrap:anywhere]">
      {icon === undefined ? null : (
        <span aria-hidden="true" className={`mb-3 flex size-12 items-center justify-center rounded-full bg-klerosUIComponentsMediumBlue ${NEXT_LINE}`}>
          {icon}
        </span>
      )}
      <p className={`text-base font-semibold text-klerosUIComponentsPrimaryText ${FIRST_LINE}`}>{title}</p>
      {body === undefined ? null : <p className={`text-sm text-klerosUIComponentsSecondaryText ${NEXT_LINE}`}>{body}</p>}
      {action === undefined ? null : <div className={`mt-4 flex flex-col items-center gap-3 ${NEXT_LINE}`}>{action}</div>}
    </div>
  );
}
