import {
  detectFamily,
  evidenceScanStart,
  getChain,
  loadEvidence,
  lookupDispute,
  readDisputeDetails,
  type Address,
  type ArbitratedBinding,
  type ArbitratorDispute,
  type ChainId,
  type DisputeEventResult,
  type DisputeLookup,
  type DisputeReads,
  type EvidenceList,
  type FamilyDetection,
  type MetaEvidenceResult,
} from "@dispute-resolver/core";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { STALE_TIME_MS } from "./constants";
import { useCoreDeps } from "./context";
import { metaEvidenceQuery } from "./metaEvidenceQuery";
import { disputeEventQuery, onChainMetaEvidenceReader } from "./onChainMetaEvidence";
import { IDLE_KEY, queryKeys } from "./queryKeys";
import { LOADING, fromOutcome, fromQuery, noRpcError, ready, unavailable, unavailableFrom } from "./sectionData";
import type { MetaEvidenceBudget, SectionData } from "./types";

/**
 * `disputes(id)` and the binding to its arbitrable (spec §5.3 step 1, §5.4, A22, D-53). `null` is the D-09 state: no
 * read. Never persisted: the binding must come from the chain, never from storage.
 */
export function useDisputeLookup(chainId: ChainId, disputeId: bigint | null): SectionData<DisputeLookup> {
  const deps = useCoreDeps();
  const query = useQuery({
    queryKey: disputeId === null ? IDLE_KEY : queryKeys.lookup(chainId, disputeId),
    queryFn: disputeId === null ? skipToken : ({ signal }) => lookupDispute({ chainId, client: deps.getReadClient(chainId), signal }, disputeId),
    staleTime: STALE_TIME_MS.lookup,
  });
  return disputeId === null ? LOADING : fromQuery(query, ready);
}

/** Family detection of the arbitrable (ADR 0003). In memory only (C11); one retry when the RPC rejects. */
export function useFamily(chainId: ChainId, arbitrable: Address | undefined): SectionData<FamilyDetection> {
  const deps = useCoreDeps();
  const client = deps.getReadClient(chainId);
  const query = useQuery({
    queryKey: arbitrable === undefined ? IDLE_KEY : queryKeys.family(chainId, arbitrable),
    queryFn: arbitrable === undefined || client === undefined ? skipToken : () => detectFamily({ client, chainId, arbitrable, registry: deps.registry, cache: deps.familyCache }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  if (arbitrable === undefined) return LOADING;
  if (client === undefined) return unavailableFrom(noRpcError(chainId));
  return fromQuery(query, ready);
}

/**
 * The meta-evidence of the dispute with the case page's or the Ongoing page's budget. The case page loads it uncached:
 * a mount, and the move from the idle key to the dispute's key once the lookup settles, always run the pipeline, and
 * no stored result, whatever its status, is shown until that run settles. Only the Ongoing cards are served from the
 * stored results. The case page passes the on-chain reader, whose `MetaEvidence` event URI wins over the locator's
 * when it is found.
 */
export function useMetaEvidence(chainId: ChainId, binding: ArbitratedBinding | undefined, budget: MetaEvidenceBudget): SectionData<MetaEvidenceResult> {
  const deps = useCoreDeps();
  const client = useQueryClient();
  const target = binding === undefined ? undefined : { disputeId: binding.disputeId, arbitrable: binding.arbitrated };
  const uncached = budget === "case";
  const onChain = uncached && binding !== undefined ? onChainMetaEvidenceReader(client, deps, chainId, binding) : undefined;
  const query = useQuery({
    ...metaEvidenceQuery(deps, chainId, target, budget, onChain),
    refetchOnMount: uncached ? "always" : true,
    // A key switch fetches only a stale query, so the stored result must count as stale for this observer. A refetch
    // trigger that consults staleness (focus, reconnect, an interval) would re-run the 120 s pipeline: keep them off.
    ...(uncached ? { staleTime: 0 } : {}),
  });
  if (binding === undefined || (uncached && !query.isFetchedAfterMount)) return LOADING;
  return fromQuery(query, ready);
}

/** The ERC-1497 `Dispute` event: never goes stale once found. Shared with the case page's on-chain reader (P-25). */
export function useDisputeEvent(chainId: ChainId, binding: ArbitratedBinding | undefined): SectionData<DisputeEventResult> {
  const deps = useCoreDeps();
  const query = useQuery(disputeEventQuery(deps, chainId, binding));
  if (binding === undefined) return LOADING;
  if (deps.getReadClient(chainId) === undefined || getChain(chainId) === undefined) return unavailableFrom(noRpcError(chainId));
  return fromQuery(query, fromOutcome);
}

/** Why the evidence of a dispute cannot be listed without its `Dispute` event (D-36: say so instead of an empty list). */
function missingEventMessage(event: Exclude<DisputeEventResult, { status: "found" }>): string {
  return event.status === "ambiguous"
    ? `The dispute's Dispute event was found ${event.count.toString()} times, so its evidence group is unknown.`
    : "The dispute's Dispute event was not found, so its evidence group is unknown.";
}

/** The evidence list of the dispute's evidence group (spec §5.14, D-22); a failed Dispute-event read degrades it with its reason (D-36). */
export function useEvidence(chainId: ChainId, binding: ArbitratedBinding | undefined, disputeEvent: SectionData<DisputeEventResult>): SectionData<EvidenceList> {
  const deps = useCoreDeps();
  const client = deps.getReadClient(chainId);
  const chain = getChain(chainId);
  const event = disputeEvent.status === "ready" ? disputeEvent.value : undefined;
  const found = event?.status === "found" ? event.event : undefined;
  const query = useQuery({
    queryKey: binding === undefined || found === undefined ? IDLE_KEY : queryKeys.evidence(chainId, binding.disputeId, binding.arbitrated, found.evidenceGroupId),
    queryFn:
      binding === undefined || found === undefined || client === undefined || chain === undefined
        ? skipToken
        : ({ signal }) =>
            loadEvidence({
              chainId,
              client,
              fetcher: deps.fetcher,
              gateway: deps.gateway,
              arbitrable: binding.arbitrated,
              arbitrator: binding.arbitrator,
              evidenceGroupId: found.evidenceGroupId,
              fromBlock: evidenceScanStart(chain),
              signal,
            }),
    staleTime: STALE_TIME_MS.evidence,
  });
  if (binding === undefined || disputeEvent.status === "loading") return LOADING;
  if (disputeEvent.status === "unavailable") return unavailableFrom(disputeEvent.error);
  if (disputeEvent.value.status !== "found") return unavailable("not-found", missingEventMessage(disputeEvent.value));
  if (client === undefined || chain === undefined) return unavailableFrom(noRpcError(chainId));
  return fromQuery(query, fromOutcome);
}

/** The found dispute: its struct and binding, as `readDisputeDetails` takes them. */
export interface FoundDispute {
  readonly dispute: ArbitratorDispute;
  readonly binding: ArbitratedBinding;
}

/**
 * Per-dispute arbitrator reads (spec §5.3 step 3, D-11). `found` is `undefined` until the caller has settled the
 * family (`undefined` when detection failed) and the Dispute-event block (`null` when there is none). Never persisted.
 */
export function useDisputeDetails(
  chainId: ChainId,
  found: FoundDispute | undefined,
  family: FamilyDetection | undefined,
  disputeEventBlock: bigint | null,
): SectionData<DisputeReads> {
  const deps = useCoreDeps();
  const query = useQuery({
    queryKey: found === undefined ? IDLE_KEY : queryKeys.details(chainId, found.dispute.id, family?.writeFamily ?? "unknown", disputeEventBlock),
    queryFn: found === undefined ? skipToken : ({ signal }) => readDisputeDetails({ chainId, client: deps.getReadClient(chainId), signal }, found, family, disputeEventBlock),
    staleTime: STALE_TIME_MS.details,
  });
  return found === undefined ? LOADING : fromQuery(query, ready);
}
