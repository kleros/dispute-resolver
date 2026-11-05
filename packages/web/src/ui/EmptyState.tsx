import { STAGGER_FIRST, STAGGER_NEXT } from "./motion";
import type { EmptyStateProps } from "./types";

export function EmptyState({ title, body, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-base border border-dashed border-klerosUIComponentsStroke bg-klerosUIComponentsWhiteBackground px-6 py-10 text-center [overflow-wrap:anywhere]">
      {icon === undefined ? null : (
        <span aria-hidden="true" className={`mb-3 flex size-12 items-center justify-center rounded-full bg-klerosUIComponentsMediumBlue ${STAGGER_NEXT}`}>
          {icon}
        </span>
      )}
      <p className={`text-base font-semibold text-klerosUIComponentsPrimaryText ${STAGGER_FIRST}`}>{title}</p>
      {body === undefined ? null : <p className={`text-sm text-klerosUIComponentsSecondaryText ${STAGGER_NEXT}`}>{body}</p>}
      {action === undefined ? null : <div className={`mt-4 flex flex-col items-center gap-3 ${STAGGER_NEXT}`}>{action}</div>}
    </div>
  );
}
