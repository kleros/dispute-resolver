import { useId } from "react";
import type { PageMessageProps } from "./types";

const FIRST_LINE = "animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_backwards] motion-reduce:animate-none";
const NEXT_LINE = "animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_var(--stagger-stagger)_backwards] motion-reduce:animate-none";

export function PageMessage({ title, body, action }: PageMessageProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-16 text-center [overflow-wrap:anywhere]">
      <h1 id={headingId} className={`text-2xl font-semibold text-klerosUIComponentsPrimaryText ${FIRST_LINE}`}>
        {title}
      </h1>
      {body === undefined ? null : <p className={`text-base text-klerosUIComponentsSecondaryText ${NEXT_LINE}`}>{body}</p>}
      {action === undefined ? null : <div className={`flex flex-wrap justify-center gap-3 ${NEXT_LINE}`}>{action}</div>}
    </section>
  );
}
