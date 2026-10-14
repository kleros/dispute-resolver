import type { ChainId } from "@dispute-resolver/core";
import { Link } from "react-router";
import { PageMessage } from "../ui";
import { paths } from "./paths";

const ACTION_CLASS =
  "inline-flex items-center rounded-base bg-klerosUIComponentsPrimaryBlue px-6 py-2 font-semibold text-klerosUIComponentsWhiteBackground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-klerosUIComponentsPrimaryBlue";

export interface DisputeNotFoundScreenProps {
  /** The page chain, from which the only link is built (A19). */
  readonly chainId: ChainId;
  /** The raw `:id` segment, shown as text and never used to build a URL. */
  readonly id: string;
}

/**
 * The case page's not-found state (spec §5.4), for a legacy interact link whose ID does not parse (P-11): the same
 * copy and "View Ongoing Disputes" link, rendered in place, so no navigation target is built from the raw segment.
 */
export function DisputeNotFoundScreen({ chainId, id }: DisputeNotFoundScreenProps) {
  return (
    <PageMessage
      title={`Dispute with ID ${id} does not exist on this network.`}
      action={
        <Link to={paths.ongoing(chainId)} className={ACTION_CLASS}>
          View Ongoing Disputes
        </Link>
      }
    />
  );
}
