import type { ChainId, Unavailable } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { Link } from "react-router";
import { paths } from "../../routing";
import { ACTION_LINK_CLASS, PageMessage, SectionSkeleton } from "../../ui";

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
  return <PageMessage title="Find a dispute" body="Enter a dispute ID above to see its summary, timeline, evidence and appeal." />;
}

export function NotFoundMessage({ chainId, id }: { readonly chainId: ChainId; readonly id: string }) {
  return <PageMessage title={notFoundTitle(id)} action={<OngoingLink chainId={chainId} />} />;
}

interface NoArbitratorMessageProps {
  readonly chainId: ChainId;
  readonly chainName: string;
  readonly id: string;
}

export function NoArbitratorMessage({ chainId, chainName, id }: NoArbitratorMessageProps) {
  return <PageMessage title={notFoundTitle(id)} body={`There is no arbitrator on ${chainName}.`} action={<OngoingLink chainId={chainId} />} />;
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
      title={`Dispute #${disputeId.toString()} could not be loaded`}
      body={error.message}
      action={<Button text="Retry" aria-label={`Retry loading dispute ${disputeId.toString()}`} variant="secondary" onPress={onRetry} />}
    />
  );
}

export function PendingSearch() {
  return (
    <div className="flex flex-col gap-6">
      <SectionSkeleton variant="card" lines={2} />
      <SectionSkeleton variant="card" lines={5} />
    </div>
  );
}
