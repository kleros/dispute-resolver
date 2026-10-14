import { useId } from "react";
import type { PageMessageProps } from "./types";

/** A full-page state: not found, no arbitrator, the case page without an ID (D-09). */
export function PageMessage({ title, body, action }: PageMessageProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-16 text-center [overflow-wrap:anywhere]">
      <h1 id={headingId} className="text-2xl font-semibold text-klerosUIComponentsPrimaryText">
        {title}
      </h1>
      {body === undefined ? null : <p className="text-base text-klerosUIComponentsSecondaryText">{body}</p>}
      {action === undefined ? null : <div className="flex flex-wrap justify-center gap-3">{action}</div>}
    </section>
  );
}
