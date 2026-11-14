import { StandardPagination } from "@kleros/ui-components-library";
import { useEffect, useRef, type Ref } from "react";

const LABEL = "aria-label";
const CURRENT = "aria-current";

interface EvidencePagerProps {
  /** Each pager on the page needs its own. */
  readonly label: string;
  /** "Entries 51–100 of 260". */
  readonly range: string;
  readonly page: number;
  readonly pageCount: number;
  readonly onChange: (page: number) => void;
  readonly navRef?: Ref<HTMLElement>;
}

/** The count and the library's page numbers: side by side from `sm`, the count above them on a phone. */
export function EvidencePager({ label, range, page, pageCount, onChange, navRef }: EvidencePagerProps) {
  const pagesRef = useRef<HTMLDivElement>(null);

  // The library's pagination names neither arrow (bare icons) and marks no current page, and its page buttons are reused
  // nodes whose numbers shift, so they are named after every render.
  useEffect(() => {
    const buttons = Array.from(pagesRef.current?.querySelectorAll("button") ?? []);
    buttons.at(0)?.setAttribute(LABEL, "Previous page");
    buttons.at(-1)?.setAttribute(LABEL, "Next page");
    for (const button of buttons.slice(1, -1)) {
      const number = button.textContent;
      button.setAttribute(LABEL, `Page ${number}`);
      if (number === String(page)) button.setAttribute(CURRENT, "page");
      else button.removeAttribute(CURRENT);
    }
  });

  return (
    <nav ref={navRef} aria-label={label} className="flex min-w-0 scroll-mt-4 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4">
      <p className="text-sm text-klerosUIComponentsSecondaryText tabular-nums">{range}</p>
      {/* The negative margins take back the library buttons' outer margin, so they line up with the row above and the list. */}
      <div ref={pagesRef} className="-my-1 min-w-0">
        <StandardPagination currentPage={page} numPages={pageCount} callback={onChange} className="-mx-1 justify-start" />
      </div>
    </nav>
  );
}
