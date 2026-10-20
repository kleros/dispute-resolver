import {
  evidenceScanStart,
  getChain,
  readDisputeEvent,
  readMetaEvidenceEvent,
  type ArbitratedBinding,
  type ChainId,
  type DisputeEventResult,
  type OnChainMetaEvidence,
  type OnChainMetaEvidenceReader,
  type Outcome,
} from "@dispute-resolver/core";
import { queryOptions, skipToken, type QueryClient } from "@tanstack/react-query";
import { STALE_TIME_MS } from "./constants";
import { IDLE_KEY, queryKeys } from "./queryKeys";
import { noRpcError } from "./sectionData";
import type { CoreDeps } from "./types";

function isFoundEvent(data: Outcome<DisputeEventResult> | undefined): boolean {
  return data?.ok === true && data.value.status === "found";
}

/**
 * The ERC-1497 `Dispute` event query (ARCHITECTURE.md §5.3), shared by `useDisputeEvent` and the case page's on-chain
 * meta-evidence reader, so the page reads the event once: it never goes stale once found. Idle without a binding, a read
 * RPC (D-56) or a configured chain.
 */
export function disputeEventQuery(deps: CoreDeps, chainId: ChainId, binding: ArbitratedBinding | undefined) {
  const client = deps.getReadClient(chainId);
  const chain = getChain(chainId);
  return queryOptions<Outcome<DisputeEventResult>>({
    queryKey: binding === undefined ? IDLE_KEY : queryKeys.disputeEvent(chainId, binding.disputeId, binding.arbitrated),
    queryFn:
      binding === undefined || client === undefined || chain === undefined
        ? skipToken
        : ({ signal }) =>
            readDisputeEvent({
              client,
              arbitrable: binding.arbitrated,
              arbitrator: binding.arbitrator,
              disputeId: binding.disputeId,
              fromBlock: evidenceScanStart(chain),
              signal,
            }),
    staleTime: (query) => (isFoundEvent(query.state.data) ? Number.POSITIVE_INFINITY : STALE_TIME_MS.disputeEventPending),
  });
}

/** `promise`, or a rejection as soon as `signal` aborts; the work behind `promise` is left running. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("The on-chain meta-evidence read was aborted.", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("The on-chain meta-evidence read was aborted.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

/**
 * The case page's on-chain meta-evidence reader (P-25, ARCHITECTURE.md §5.3): the dispute's `Dispute` event through the
 * shared query, then the arbitrable's `MetaEvidence` event for its meta-evidence ID, read directly on every load (no
 * query, no cache), so a re-emission between two loads is seen. The shared query never receives the reader's signal: an
 * abort stops the wait for it, never the query, which `useDisputeEvent` also observes; a Dispute event that was not found
 * or failed is read again by a new load. The `MetaEvidence` read carries the reader's signal and is cancelled with the
 * load. The arbitrable is the arbitrator's `arbitrated` (A22).
 */
export function onChainMetaEvidenceReader(client: QueryClient, deps: CoreDeps, chainId: ChainId, binding: ArbitratedBinding): OnChainMetaEvidenceReader {
  return async (signal): Promise<OnChainMetaEvidence> => {
    const readClient = deps.getReadClient(chainId);
    const chain = getChain(chainId);
    if (readClient === undefined || chain === undefined) return { status: "unavailable", error: noRpcError(chainId) };
    const shared = disputeEventQuery(deps, chainId, binding);
    const disputeEvent = await untilAborted(client.query({ ...shared, staleTime: (query) => (isFoundEvent(query.state.data) ? Number.POSITIVE_INFINITY : 0) }), signal);
    if (!disputeEvent.ok) return { status: "unavailable", error: disputeEvent.error };
    const found = disputeEvent.value;
    if (found.status === "not-found") return { status: "not-found", reason: "dispute-event-not-found" };
    if (found.status === "ambiguous") return { status: "not-found", reason: "dispute-event-ambiguous" };
    const metaEvidence = await readMetaEvidenceEvent({
      client: readClient,
      arbitrable: binding.arbitrated,
      metaEvidenceId: found.event.metaEvidenceId,
      fromBlock: evidenceScanStart(chain),
      signal,
    });
    if (!metaEvidence.ok) return { status: "unavailable", error: metaEvidence.error };
    return metaEvidence.value.status === "found" ? { status: "found", uri: metaEvidence.value.event.uri } : { status: "not-found", reason: "meta-evidence-event-not-found" };
  };
}
