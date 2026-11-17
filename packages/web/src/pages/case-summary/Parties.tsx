import { toRegistryAddress, type ChainConfig } from "@dispute-resolver/core";
import { AddressText, LABEL } from "../../ui";

interface PartiesProps {
  /** `{address: name}`, keys already accepted as addresses by core. */
  readonly aliases: Readonly<Record<string, string>>;
  readonly chain: ChainConfig;
}

const VALUE_CLASS = "min-w-0 text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]";

/** From `sm` up every row shares the list's three tracks, so labels, names and addresses line up across parties. */
const ROW_CLASS = "flex min-w-0 flex-col gap-y-1 py-3 last:pb-0 sm:col-span-3 sm:grid sm:grid-cols-subgrid sm:items-baseline sm:gap-y-0";

/** The copy button's hit area reaches 4 px past its icon; the inset keeps it inside the list when the address sits at the right edge. */
const ADDRESS_CLASS = `${VALUE_CLASS} sm:justify-self-end sm:pr-1`;

export function Parties({ aliases, chain }: PartiesProps) {
  const entries = Object.entries(aliases);
  if (entries.length === 0) return null;
  return (
    <dl className="divide-y divide-klerosUIComponentsStroke border-t border-klerosUIComponentsStroke sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6">
      {entries.map(([address, name], index) => (
        <div key={address} className={ROW_CLASS}>
          <dt className={`${LABEL} whitespace-nowrap`}>{`Party ${(index + 1).toString()}`}</dt>
          <dd className={`${VALUE_CLASS} font-semibold`}>{name}</dd>
          <dd className={ADDRESS_CLASS}>
            <AddressText address={toRegistryAddress(address)} chain={chain} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
