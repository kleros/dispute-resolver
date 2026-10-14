import { toRegistryAddress, type ChainConfig } from "@dispute-resolver/core";
import { Fragment } from "react";
import { AddressText } from "../../ui";

interface PartiesProps {
  /** Meta-evidence `aliases`: `{address: name}`, keys already accepted as addresses by core. */
  readonly aliases: Readonly<Record<string, string>>;
  readonly chain: ChainConfig;
}

const TERM_CLASS = "text-sm text-klerosUIComponentsSecondaryText";
const VALUE_CLASS = "min-w-0 text-klerosUIComponentsPrimaryText [overflow-wrap:anywhere]";

/** "Party N" with its alias and "Party N address" for each meta-evidence alias (spec 5.6), addresses linked to the explorer (D-40). */
export function Parties({ aliases, chain }: PartiesProps) {
  const entries = Object.entries(aliases);
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-base border border-klerosUIComponentsStroke p-4 sm:grid-cols-2">
      {entries.map(([address, name], index) => {
        const party = `Party ${(index + 1).toString()}`;
        return (
          <Fragment key={address}>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className={TERM_CLASS}>{party}</dt>
              <dd className={`${VALUE_CLASS} font-semibold`}>{name}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className={TERM_CLASS}>{`${party} address`}</dt>
              <dd className={VALUE_CLASS}>
                <AddressText address={toRegistryAddress(address)} chain={chain} />
              </dd>
            </div>
          </Fragment>
        );
      })}
    </dl>
  );
}
