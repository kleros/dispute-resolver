import type { ChainId, Unavailable } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { Link } from "react-router";
import { paths } from "../../routing";
import { ACTION_LINK_CLASS, PageMessage, RECORD_BAND, SectionSkeleton } from "../../ui";
import { PendingOverview } from "../case-summary";

/** `id` is untrusted URL text: shown as text only, never put in a URL or an attribute. */
function notFoundTitle(id: string): string {
  return `Dispute with ID ${id} does not exist on this network.`;
}

function OngoingLink({ chainId }: { readonly chainId: ChainId }) {
  return (
    <Link to={paths.ongoing(chainId)} className={ACTION_LINK_CLASS}>
      View Ongoing Disputes
    </Link>
  );
}

export function NoDisputeMessage() {
  return <PageMessage compact title="Find a dispute" body="Enter a dispute ID above to see its summary, timeline, evidence and appeal." />;
}

export function NotFoundMessage({ chainId, id }: { readonly chainId: ChainId; readonly id: string }) {
  return <PageMessage compact title={notFoundTitle(id)} action={<OngoingLink chainId={chainId} />} />;
}

interface NoArbitratorMessageProps {
  readonly chainId: ChainId;
  readonly chainName: string;
  readonly id: string;
}

export function NoArbitratorMessage({ chainId, chainName, id }: NoArbitratorMessageProps) {
  return <PageMessage compact title={notFoundTitle(id)} body={`There is no arbitrator on ${chainName}.`} action={<OngoingLink chainId={chainId} />} />;
}

interface UnavailableMessageProps {
  readonly disputeId: bigint;
  readonly error: Unavailable;
  readonly onRetry: () => void;
}

/** The lookup failed in transport: the dispute may exist, so it is not reported as missing. */
export function UnavailableMessage({ disputeId, error, onRetry }: UnavailableMessageProps) {
  return (
    <PageMessage
      compact
      title={`Dispute #${disputeId.toString()} could not be loaded`}
      body={error.message}
      action={<Button text="Retry" aria-label={`Retry loading dispute ${disputeId.toString()}`} variant="secondary" onPress={onRetry} />}
    />
  );
}

/** The record band: the overview over the timeline. */
export const CASE_BAND = `${RECORD_BAND} flex min-w-0 flex-col gap-6 p-4 lg:px-8 lg:py-6`;

interface PendingSearchProps {
  /** The typed ID, already in the URL, or `null` when the text is no ID. */
  readonly disputeId: bigint | null;
  readonly chainName: string;
}

/** The page the lookup shows while it loads (the record band, the summary card, the section bars), so the page keeps still when the lookup starts. */
export function PendingSearch({ disputeId, chainName }: PendingSearchProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className={CASE_BAND}>
        <PendingOverview disputeId={disputeId} chainName={chainName} />
        <SectionSkeleton variant="text" lines={2} />
      </div>
      <SectionSkeleton variant="card" lines={5} />
      <SectionSkeleton variant="bars" lines={3} />
    </div>
  );
}
