import {
  CASE_PAGE_BUDGET_MS,
  ONGOING_BUDGET_MS,
  loadMetaEvidence,
  metaEvidenceCachePolicy,
  type Address,
  type MetaEvidenceResult,
  type OnChainMetaEvidenceReader,
} from "@dispute-resolver/core";
import { queryOptions, skipToken } from "@tanstack/react-query";
import { PERSISTED_QUERY_GC_TIME_MS, STALE_TIME_MS } from "./constants";
import { IDLE_KEY, queryKeys } from "./queryKeys";
import type { CoreDeps, MetaEvidenceBudget } from "./types";

/** `arbitrable` is the arbitrator's `arbitrated`, never the meta-evidence's. */
interface MetaEvidenceTarget {
  readonly disputeId: bigint;
  readonly arbitrable: Address;
}

const BUDGET_MS: Readonly<Record<MetaEvidenceBudget, number>> = { case: CASE_PAGE_BUDGET_MS, ongoing: ONGOING_BUDGET_MS };

export function metaEvidenceStaleTime(result: MetaEvidenceResult | undefined): number {
  if (result === undefined) return 0;
  switch (metaEvidenceCachePolicy(result)) {
    case "persist":
      return Number.POSITIVE_INFINITY;
    case "memory-brief":
      return STALE_TIME_MS.metaEvidenceBrief;
    case "never":
      return 0;
  }
}

/**
 * Shared by the case page and the Ongoing cards: an Ongoing card runs the pipeline only when no fresh result is stored,
 * while the case page's observer overrides the stale time to 0 (`useMetaEvidence`). The Ongoing cards pass no `onChain`
 * reader, so they make no per-dispute log read.
 */
export function metaEvidenceQuery(deps: CoreDeps, chainId: number, target: MetaEvidenceTarget | undefined, budget: MetaEvidenceBudget, onChain?: OnChainMetaEvidenceReader) {
  return queryOptions<MetaEvidenceResult>({
    queryKey: target === undefined ? IDLE_KEY : queryKeys.metaEvidence(chainId, target.disputeId, target.arbitrable),
    queryFn:
      target === undefined
        ? skipToken
        : ({ signal }) =>
            loadMetaEvidence({
              arbitratorChainId: chainId,
              disputeId: target.disputeId,
              arbitrable: target.arbitrable,
              env: deps.env,
              fetcher: deps.fetcher,
              runner: deps.runner,
              realityCache: deps.realityCache,
              registry: deps.registry,
              budgetMs: BUDGET_MS[budget],
              onChain,
              signal,
            }),
    staleTime: (query) => metaEvidenceStaleTime(query.state.data),
    // Never collected, so an `ok` result is still in the cache when it is next persisted.
    gcTime: PERSISTED_QUERY_GC_TIME_MS,
  });
}
