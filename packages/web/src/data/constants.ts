/**
 * Bump whenever a content-addressing rule, a core schema or a persisted shape changes: a restored cache whose version
 * differs is discarded whole, so no entry keeps an outdated reading.
 */
export const CACHE_VERSION = "dr-cache-5";

export const PERSISTED_CACHE_KEY = "dr-query-cache";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const PERSISTED_CACHE_MAX_AGE_MS = 30 * 24 * HOUR_MS;

/**
 * Never collected while the tab lives, so an entry nobody observes is still in the cache when it is next persisted. A
 * finite `gcTime` as long as the 30-day maxAge cannot be used: it exceeds the largest `setTimeout` delay (2^31 - 1 ms,
 * about 24.8 days), so browsers fire it at once and the entry is dropped from the next blob.
 */
export const PERSISTED_QUERY_GC_TIME_MS = Number.POSITIVE_INFINITY;

export const PERSIST_THROTTLE_MS = SECOND_MS;

/**
 * Covers the body read too. The Ongoing list waits for the courts, so a gateway that never answers one policy would
 * otherwise hold the whole page; a policy that misses the bound only leaves that court's name unknown.
 */
export const COURT_POLICY_FETCH_TIMEOUT_MS = 10 * SECOND_MS;

/**
 * Covers the body read too. Evidence documents are fetched six at a time and the timeline renders once every fetch has
 * settled, so one that never answers would hold the whole list; one that misses the bound is counted as fetch-failed.
 * Longer than the court policies' bound because an evidence document may be pinned on a single node the gateway has
 * to find first.
 */
export const EVIDENCE_FETCH_TIMEOUT_MS = 20 * SECOND_MS;

/**
 * The most the fetcher reads of one body: a meta-evidence API answer, a meta-evidence or evidence document, a dynamic
 * script or a court policy. The largest allowlisted dynamic script is 2.1 MB and the largest recorded meta-evidence
 * document is under 1 MB.
 */
export const FETCH_BODY_MAX_BYTES = 4 * 1024 * 1024;

export const STALE_TIME_MS = {
  courts: 3 * HOUR_MS,
  ongoing: MINUTE_MS,
  lookup: 30 * SECOND_MS,
  /** `memory-brief` meta-evidence results: failures are kept briefly instead of retried on every render. */
  metaEvidenceBrief: 30 * SECOND_MS,
  disputeEventPending: MINUTE_MS,
  evidence: MINUTE_MS,
  details: 30 * SECOND_MS,
  multipliers: 10 * MINUTE_MS,
  funding: 30 * SECOND_MS,
  withdrawable: 30 * SECOND_MS,
  arbitrationCost: MINUTE_MS,
} as const;

/** How often the chain clock's sample is checked against a change of the browser clock. */
export const CHAIN_CLOCK_CHECK_MS = 30 * SECOND_MS;

/** Smaller changes are within the error a sample already carries: the latest block is up to a block interval old, in whole seconds. */
export const CLOCK_STEP_TOLERANCE_MS = 5 * SECOND_MS;
