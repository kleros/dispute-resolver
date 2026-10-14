import { CASE_PAGE_BUDGET_MS, ONGOING_BUDGET_MS, loadMetaEvidence, metaEvidenceCachePolicy, type Address, type ChainId, type MetaEvidenceResult } from "@dispute-resolver/core";
import { queryOptions, skipToken } from "@tanstack/react-query";
import { PERSISTED_QUERY_GC_TIME_MS, STALE_TIME_MS } from "./constants";
import { IDLE_KEY, queryKeys } from "./queryKeys";
import type { CoreDeps, MetaEvidenceBudget } from "./types";

/** The dispute whose meta-evidence is loaded, bound to its arbitrable by the arbitrator (A22). */
export interface MetaEvidenceTarget {
  readonly disputeId: bigint;
  readonly arbitrable: Address;
}

const BUDGET_MS: Readonly<Record<MetaEvidenceBudget, number>> = { case: CASE_PAGE_BUDGET_MS, ongoing: ONGOING_BUDGET_MS };

/** `persist` results never go stale, failures are kept briefly (D-38), rejections not at all (A2). */
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
 * The meta-evidence query of one dispute, shared by the case page and the Ongoing cards (ARCHITECTURE.md §5.3):
 * whichever mounts first runs the pipeline with its own budget. `arbitrable` is the arbitrator's `arbitrated` (A22).
 * Without a target the query is idle and never runs.
 */
export function metaEvidenceQuery(deps: CoreDeps, chainId: ChainId, target: MetaEvidenceTarget | undefined, budget: MetaEvidenceBudget) {
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
              signal,
            }),
    staleTime: (query) => metaEvidenceStaleTime(query.state.data),
    // Never collected, so an `ok` result is still in the cache when it is next persisted.
    gcTime: PERSISTED_QUERY_GC_TIME_MS,
  });
}
