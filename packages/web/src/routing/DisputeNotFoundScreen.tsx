import type { ChainId } from "@dispute-resolver/core";
import { Link } from "react-router";
import { ACTION_LINK_CLASS, PageMessage } from "../ui";
import { paths } from "./paths";

export interface DisputeNotFoundScreenProps {
  readonly chainId: ChainId;
  /** The raw `:id` segment, shown as text and never used to build a URL. */
  readonly id: string;
}

/** For an interact link whose ID does not parse: rendered in place, so no navigation target is built from the raw segment. */
export function DisputeNotFoundScreen({ chainId, id }: DisputeNotFoundScreenProps) {
  return (
    <PageMessage
      title={`Dispute with ID ${id} does not exist on this network.`}
      action={
        <Link to={paths.ongoing(chainId)} className={ACTION_LINK_CLASS}>
          View Ongoing Disputes
        </Link>
      }
    />
  );
}
