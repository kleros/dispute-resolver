import {
  detectFamily,
  evidenceScanStart,
  getChain,
  loadEvidence,
  lookupDispute,
  readDisputeDetails,
  readExecutedRuling,
  type Address,
  type ArbitratedBinding,
  type ArbitratorDispute,
  type DisputeEventResult,
  type DisputeLookup,
  type DisputeReads,
  type EvidenceList,
  type ExecutedRuling,
  type FamilyDetection,
  type MetaEvidenceResult,
} from "@dispute-resolver/core";
import { skipToken, useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { EVIDENCE_FETCH_TIMEOUT_MS, STALE_TIME_MS } from "./constants";
import { useCoreDeps } from "./context";
import { withTimeout } from "./fetcher";
import { metaEvidenceQuery } from "./metaEvidenceQuery";
import { disputeEventQuery, onChainMetaEvidenceReader } from "./onChainMetaEvidence";
import { IDLE_KEY, queryKeys } from "./queryKeys";
import { LOADING, fromOutcome, fromQuery, noRpcError, ready, unavailable, unavailableFrom } from "./sectionData";
import type { MetaEvidenceBudget, SectionData } from "./types";

/** A `null` ID reads nothing. Never persisted: the binding must come from the chain, never from storage. */
export function useDisputeLookup(chainId: number, disputeId: bigint | null): SectionData<DisputeLookup> {
  const deps = useCoreDeps();
  const query = useQuery({
    queryKey: disputeId === null ? IDLE_KEY : queryKeys.lookup(chainId, disputeId),
    queryFn: disputeId === null ? skipToken : ({ signal }) => lookupDispute({ chainId, client: deps.getReadClient(chainId), signal }, disputeId),
    staleTime: STALE_TIME_MS.lookup,
  });
  return disputeId === null ? LOADING : fromQuery(query, ready);
}

export function useFamily(chainId: number, arbitrable: Address | undefined): SectionData<FamilyDetection> {
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
 * The case page loads it uncached: a mount, and the move from the idle key to the dispute's key once the lookup
 * settles, always run the pipeline, and no stored result, whatever its status, is shown until that run settles. Only
 * the Ongoing cards are served from the stored results. The case page passes the on-chain reader, whose `MetaEvidence`
 * event URI wins over the locator's when it is found.
 */
export function useMetaEvidence(chainId: number, binding: ArbitratedBinding | undefined, budget: MetaEvidenceBudget): SectionData<MetaEvidenceResult> {
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

export function useDisputeEvent(chainId: number, binding: ArbitratedBinding | undefined): SectionData<DisputeEventResult> {
  const deps = useCoreDeps();
  const query = useQuery(disputeEventQuery(deps, chainId, binding));
  if (binding === undefined) return LOADING;
  if (deps.getReadClient(chainId) === undefined || getChain(chainId) === undefined) return unavailableFrom(noRpcError(chainId));
  return fromQuery(query, fromOutcome);
}

/** Without its `Dispute` event the evidence group is unknown: the section says so instead of showing an empty list. */
function missingEventMessage(event: Exclude<DisputeEventResult, { status: "found" }>): string {
  return event.status === "ambiguous"
    ? `The dispute's Dispute event was found ${event.count.toString()} times, so its evidence group is unknown.`
    : "The dispute's Dispute event was not found, so its evidence group is unknown.";
}

export function useEvidence(chainId: number, binding: ArbitratedBinding | undefined, disputeEvent: SectionData<DisputeEventResult>): SectionData<EvidenceList> {
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
              client,
              fetcher: withTimeout(deps.fetcher, EVIDENCE_FETCH_TIMEOUT_MS),
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

export interface FoundDispute {
  readonly dispute: ArbitratorDispute;
  readonly binding: ArbitratedBinding;
}

/**
 * `found` is `undefined` until the caller has settled the family (`undefined` when detection failed) and the
 * Dispute-event block (`null` when there is none).
 */
export function useDisputeDetails(
  chainId: number,
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

/**
 * Reports already inconsistent or out of range are kept: more events can never turn them into a winner. One executed
 * ruling is not, since the arbitrable can still emit a different one, and a report not made yet may still come.
 */
function executedRulingStaleTime(query: Query<ExecutedRuling>): number {
  switch (query.state.data?.status) {
    case "inconsistent":
    case "out-of-range":
      return Number.POSITIVE_INFINITY;
    case "executed":
    case "none-reported":
      return STALE_TIME_MS.executedRulingReport;
    default:
      return STALE_TIME_MS.details;
  }
}

const NOT_EXECUTED: SectionData<ExecutedRuling> = ready({ status: "not-executed" });

/**
 * The ruling the arbitrable reports it executed, scanned from `fromBlock` (`undefined` until it is known). `null` outside
 * execution; `not-executed`, with no read, until the arbitrator has executed the ruling. It only ever feeds the decision
 * text, never a write, a panel or an address.
 */
export function useExecutedRuling(chainId: number, found: FoundDispute | undefined, fromBlock: bigint | undefined): SectionData<ExecutedRuling> | null {
  const deps = useCoreDeps();
  const client = deps.getReadClient(chainId);
  const dispute = found?.dispute;
  const enabled = found !== undefined && dispute?.period === 4 && dispute.ruled && client !== undefined && fromBlock !== undefined;
  const query = useQuery({
    queryKey: enabled ? queryKeys.executedRuling(chainId, found.binding.disputeId, fromBlock) : IDLE_KEY,
    queryFn: enabled ? ({ signal }) => readExecutedRuling({ chainId, client, signal }, { binding: found.binding, dispute: found.dispute, fromBlock }) : skipToken,
    staleTime: executedRulingStaleTime,
  });
  if (dispute === undefined) return LOADING;
  if (dispute.period !== 4) return null;
  if (!dispute.ruled) return NOT_EXECUTED;
  if (client === undefined) return ready({ status: "unread", error: noRpcError(chainId) });
  if (fromBlock === undefined) return LOADING;
  return fromQuery(query, ready);
}
