import type { ChainId } from "@dispute-resolver/core";
import { NumberField } from "@kleros/ui-components-library";
import { useId, type ChangeEvent, type FormEvent, type SVGAttributes } from "react";
import { courtCaseUrl, ExternalLink } from "../../safe-content";
import { EYEBROW } from "../../ui";
import type { DisputeSearch } from "./useDisputeSearch";

/** Whole IDs only, written without grouping: "1234", never "1,234". */
const ID_FORMAT: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 0 };

function MagnifierIcon({ className, ...props }: Readonly<SVGAttributes<SVGElement>>) {
  return (
    <svg {...props} aria-hidden="true" viewBox="0 0 24 24" className={`${className ?? ""} fill-none stroke-klerosUIComponentsPrimaryBlue`} strokeWidth="2" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

interface SearchBoxProps {
  readonly chainId: ChainId;
  readonly search: DisputeSearch;
}

/**
 * The search row of the case page (spec 5.2): "Search Disputes on Court", with Court opening the shown dispute on Court
 * (dispute 0 while the field is empty, as today), and the dispute ID field. Every change replaces the URL at once and
 * loads the typed ID after today's debounce (spec 1.4); Enter loads it at once (P-19).
 */
export function SearchBox({ chainId, search }: SearchBoxProps) {
  const labelId = useId();
  const shown = search.shownId;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    search.submit();
  };
  return (
    <form role="search" aria-labelledby={labelId} onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <p id={labelId} className={EYEBROW}>
        Search Disputes on{" "}
        <ExternalLink href={courtCaseUrl(shown ?? 0n, chainId)} testId="link-court">
          Court
        </ExternalLink>
      </p>
      <NumberField
        aria-label="Dispute ID"
        placeholder="Dispute ID"
        minValue={0}
        formatOptions={ID_FORMAT}
        value={shown === null ? Number.NaN : Number(shown)}
        onChange={(value) => {
          search.change(Number.isNaN(value) ? "" : value.toString());
        }}
        inputProps={{
          onChange: (event: ChangeEvent<HTMLInputElement>) => {
            search.change(event.currentTarget.value);
          },
        }}
        Icon={MagnifierIcon}
        className="w-full sm:w-72"
      />
    </form>
  );
}
