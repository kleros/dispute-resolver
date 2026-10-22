import type { ChainId } from "@dispute-resolver/core";
import { NumberField } from "@kleros/ui-components-library";
import { useId, type ChangeEvent, type FormEvent, type SVGAttributes } from "react";
import { courtCaseUrl, ExternalLink } from "../../safe-content";
import { EYEBROW } from "../../ui";
import type { DisputeSearch } from "./useDisputeSearch";

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

export function SearchBox({ chainId, search }: SearchBoxProps) {
  const labelId = useId();
  const shown = search.shownId;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    search.submit();
  };
  return (
    <form role="search" aria-labelledby={labelId} onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
      <p id={labelId} className={EYEBROW}>
        Search Disputes on <ExternalLink href={courtCaseUrl(shown ?? 0n, chainId)}>Court</ExternalLink>
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
        className="w-full sm:w-72 [&_input::placeholder]:opacity-100"
      />
    </form>
  );
}
