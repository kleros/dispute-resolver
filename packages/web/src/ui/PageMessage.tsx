import { useId } from "react";
import { STAGGER_FIRST, STAGGER_NEXT } from "./motion";
import type { PageMessageProps } from "./types";

export function PageMessage({ title, body, action, compact = false }: PageMessageProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 text-center [overflow-wrap:anywhere] ${compact ? "pt-8 pb-16" : "py-16"}`}
    >
      <h1 id={headingId} className={`text-2xl font-semibold text-klerosUIComponentsPrimaryText ${STAGGER_FIRST}`}>
        {title}
      </h1>
      {body === undefined ? null : <p className={`text-base text-pretty text-klerosUIComponentsSecondaryText ${STAGGER_NEXT}`}>{body}</p>}
      {action === undefined ? null : <div className={`flex flex-wrap justify-center gap-3 ${STAGGER_NEXT}`}>{action}</div>}
    </section>
  );
}
