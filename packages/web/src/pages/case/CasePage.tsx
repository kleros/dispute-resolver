import { parseDisputeId, type ChainConfig, type ChainId } from "@dispute-resolver/core";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useParams } from "react-router";
import { queryKeys, useCase, type CaseDispute } from "../../data";
import { casePageAttributes, type CasePageHook } from "../../parity";
import { usePageChain } from "../../routing";
import { useWallet } from "../../wallet";
import { DisputeSections } from "./DisputeSections";
import { NoArbitratorMessage, NoDisputeMessage, NotFoundMessage, PendingSearch, UnavailableMessage } from "./PageStates";
import { casePageHook } from "./pageState";
import { SearchBox } from "./SearchBox";
import { useDisputeSearch } from "./useDisputeSearch";

interface CaseFrameProps {
  readonly hook: CasePageHook;
  readonly search: ReactNode;
  readonly children: ReactNode;
}

/** The page's reading column: the `case-page` parity hook on a plain element (§12.1, S-1), the search row, the state. */
function CaseFrame({ hook, search, children }: CaseFrameProps) {
  return (
    <div {...casePageAttributes(hook)} className="mx-auto flex w-full max-w-[1080px] min-w-0 flex-col gap-6">
      {search}
      {children}
    </div>
  );
}

interface DisputeStateProps {
  readonly dispute: CaseDispute;
  readonly chain: ChainConfig;
}

/** One dispute as its lookup stands: its sections while loading or found, else why there is none (spec 5.4, D-53). */
function DisputeState({ dispute, chain }: DisputeStateProps) {
  const client = useQueryClient();
  const { lookup, chainId, disputeId } = dispute;
  const id = disputeId.toString();
  const retryLookup = () => {
    void client.invalidateQueries({ queryKey: queryKeys.lookup(chainId, disputeId) });
  };
  if (lookup.status === "unavailable") return <UnavailableMessage disputeId={disputeId} error={lookup.error} onRetry={retryLookup} />;
  if (lookup.status === "loading") return <DisputeSections dispute={dispute} chain={chain} />;
  switch (lookup.value.status) {
    case "found":
      return <DisputeSections dispute={dispute} chain={chain} />;
    case "not-found":
      return <NotFoundMessage chainId={chainId} id={id} />;
    case "no-arbitrator":
      return <NoArbitratorMessage chainId={chainId} chainName={chain.name} id={id} />;
    case "unavailable":
      return <UnavailableMessage disputeId={disputeId} error={lookup.value.error} onRetry={retryLookup} />;
  }
}

/** What the page shows when it loads no dispute: a pending search, no ID, an ID that does not parse, or no arbitrator. */
type Placeholder =
  | { readonly kind: "pending"; readonly empty: boolean }
  | { readonly kind: "no-id" }
  | { readonly kind: "not-found"; readonly id: string }
  | { readonly kind: "no-arbitrator"; readonly id: string };

function placeholderHook(placeholder: Placeholder): CasePageHook {
  if (placeholder.kind === "pending") return { state: placeholder.empty ? "no-id" : "loading" };
  return { state: placeholder.kind };
}

interface PlaceholderStateProps {
  readonly placeholder: Placeholder;
  readonly chainId: ChainId;
  readonly chainName: string;
}

function PlaceholderState({ placeholder, chainId, chainName }: PlaceholderStateProps) {
  switch (placeholder.kind) {
    case "pending":
      return placeholder.empty ? <NoDisputeMessage /> : <PendingSearch />;
    case "no-id":
      return <NoDisputeMessage />;
    case "not-found":
      return <NotFoundMessage chainId={chainId} id={placeholder.id} />;
    case "no-arbitrator":
      return <NoArbitratorMessage chainId={chainId} chainName={chainName} id={placeholder.id} />;
  }
}

/**
 * The case page (spec 5.1 to 5.5, 5.16; ARCHITECTURE.md §3.1, §11.5, §12.1) at `/:chainId/cases` and
 * `/:chainId/cases/:id`. The ID is parsed only with core's `parseDisputeId` (A19): none is the search box with no
 * dispute (D-09), one that does not parse is the not-found state with no read, and a chain without an arbitrator reads
 * nothing. A typed search clears the shown dispute at once (D-53). The layout route keys the page by its chain, so a
 * chain change loads the same ID on the new chain without a reload (D-55).
 */
export function CasePage() {
  const { chainId, chain, capabilities } = usePageChain();
  const urlId = useParams().id;
  const parsedId = urlId === undefined ? null : parseDisputeId(urlId);
  const wallet = useWallet();
  const search = useDisputeSearch(chainId, urlId);
  const loadedId = search.pending === null && capabilities.hasArbitrator ? parsedId : null;
  const data = useCase(chainId, loadedId, wallet.status === "connected" ? wallet.address : undefined);
  const searchBox = <SearchBox chainId={chainId} search={search} />;

  let placeholder: Placeholder | null = null;
  if (search.pending !== null) placeholder = { kind: "pending", empty: search.pending === "" };
  else if (urlId === undefined) placeholder = { kind: "no-id" };
  else if (parsedId === null) placeholder = { kind: "not-found", id: urlId };
  else if (!capabilities.hasArbitrator) placeholder = { kind: "no-arbitrator", id: parsedId.toString() };

  if (placeholder !== null || data.status !== "dispute") {
    const shown = placeholder ?? { kind: "no-id" };
    return (
      <CaseFrame hook={placeholderHook(shown)} search={searchBox}>
        <PlaceholderState placeholder={shown} chainId={chainId} chainName={chain.name} />
      </CaseFrame>
    );
  }
  return (
    <CaseFrame hook={casePageHook(data)} search={searchBox}>
      <DisputeState dispute={data} chain={chain} />
    </CaseFrame>
  );
}
