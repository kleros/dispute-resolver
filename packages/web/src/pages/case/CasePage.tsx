import { parseDisputeId, type ChainConfig } from "@dispute-resolver/core";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import { queryKeys, useCase, type CaseDispute } from "../../data";
import { usePageChain } from "../../routing";
import { useWallet } from "../../wallet";
import { DisputeSections } from "./DisputeSections";
import { NoArbitratorMessage, NoDisputeMessage, NotFoundMessage, PendingSearch, UnavailableMessage } from "./PageStates";
import { SearchBox } from "./SearchBox";
import { useBoundaryRetries, type BoundaryRetries } from "./useBoundaryRetries";
import { useDisputeSearch } from "./useDisputeSearch";

interface DisputeStateProps {
  readonly dispute: CaseDispute;
  readonly chain: ChainConfig;
  readonly retries: BoundaryRetries;
}

function DisputeState({ dispute, chain, retries }: DisputeStateProps) {
  const client = useQueryClient();
  const { lookup, chainId, disputeId } = dispute;
  const id = disputeId.toString();
  const retryLookup = () => {
    void client.invalidateQueries({ queryKey: queryKeys.lookup(chainId, disputeId) });
  };
  if (lookup.status === "unavailable") return <UnavailableMessage disputeId={disputeId} error={lookup.error} onRetry={retryLookup} />;
  if (lookup.status === "loading") return <DisputeSections dispute={dispute} chain={chain} retries={retries} />;
  switch (lookup.value.status) {
    case "found":
      return <DisputeSections dispute={dispute} chain={chain} retries={retries} />;
    case "not-found":
      return <NotFoundMessage chainId={chainId} id={id} />;
    case "no-arbitrator":
      return <NoArbitratorMessage chainId={chainId} chainName={chain.name} id={id} />;
    case "unavailable":
      return <UnavailableMessage disputeId={disputeId} error={lookup.value.error} onRetry={retryLookup} />;
  }
}

type Placeholder =
  | { readonly kind: "pending"; readonly empty: boolean; readonly disputeId: bigint | null }
  | { readonly kind: "no-id" }
  | { readonly kind: "not-found"; readonly id: string }
  | { readonly kind: "no-arbitrator"; readonly id: string };

interface PlaceholderStateProps {
  readonly placeholder: Placeholder;
  readonly chainId: number;
  readonly chainName: string;
}

function PlaceholderState({ placeholder, chainId, chainName }: PlaceholderStateProps) {
  switch (placeholder.kind) {
    case "pending":
      return placeholder.empty ? <NoDisputeMessage /> : <PendingSearch disputeId={placeholder.disputeId} chainName={chainName} />;
    case "no-id":
      return <NoDisputeMessage />;
    case "not-found":
      return <NotFoundMessage chainId={chainId} id={placeholder.id} />;
    case "no-arbitrator":
      return <NoArbitratorMessage chainId={chainId} chainName={chainName} id={placeholder.id} />;
  }
}

/**
 * The URL ID is parsed only with core's `parseDisputeId`; one that does not parse is the not-found state with no read.
 * The layout route keys the page by its chain, so a chain change loads the same ID on the new chain without a reload.
 */
export function CasePage() {
  const { chainId, chain, capabilities } = usePageChain();
  const urlId = useParams().id;
  const parsedId = urlId === undefined ? null : parseDisputeId(urlId);
  const wallet = useWallet();
  const search = useDisputeSearch(chainId, urlId);
  const loadedId = search.pending === null && capabilities.hasArbitrator ? parsedId : null;
  const data = useCase(chainId, loadedId, wallet.status === "connected" ? wallet.address : undefined);
  // Next to `useCase`, so a section's boundary remounts in a render that reads its new data.
  const retries = useBoundaryRetries();
  // The empty lookup page has nothing to do but type an ID; a case page is there to be read, so it keeps focus where it is.
  const searchBox = <SearchBox search={search} autoFocus={urlId === undefined} />;

  let placeholder: Placeholder | null = null;
  if (search.pending !== null) placeholder = { kind: "pending", empty: search.pending === "", disputeId: parsedId };
  else if (urlId === undefined) placeholder = { kind: "no-id" };
  else if (parsedId === null) placeholder = { kind: "not-found", id: urlId };
  else if (!capabilities.hasArbitrator) placeholder = { kind: "no-arbitrator", id: parsedId.toString() };

  return (
    <div className="mx-auto flex w-full max-w-[1080px] min-w-0 flex-col gap-6">
      {searchBox}
      {placeholder !== null || data.status !== "dispute" ? (
        <PlaceholderState placeholder={placeholder ?? { kind: "no-id" }} chainId={chainId} chainName={chain.name} />
      ) : (
        <DisputeState dispute={data} chain={chain} retries={retries} />
      )}
    </div>
  );
}
