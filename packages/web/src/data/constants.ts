/**
 * Version of everything persisted by the query cache (B15, D-13). Bump it whenever a content-addressing rule, a core
 * schema or a persisted shape changes: a restored cache whose version differs is discarded whole. Version 2: core reads
 * `rulingOptions.precision` differently and drops trailing empty option descriptions (P-09), and a meta-evidence result
 * restored from version 1 would keep the old reading. Version 3: core reads a hexadecimal `precision` (`"0x12"`) in base
 * 16, as reality-eth-lib does, where version 2 stored 0. Version 4: an accepted meta-evidence carries the `source` that
 * decided it (P-25), and the locator's wrong answers stored under version 3 (Gnosis 460) are dropped.
 */
export const CACHE_VERSION = "dr-cache-4";

/** localStorage key of the persisted query cache (ARCHITECTURE.md §5.4). */
export const PERSISTED_CACHE_KEY = "dr-query-cache";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/** How long a persisted entry may be restored after it was written. */
export const PERSISTED_CACHE_MAX_AGE_MS = 30 * 24 * HOUR_MS;

/**
 * `gcTime` of every query kind that may be persisted, and of every restored entry: never collected while the tab lives,
 * so an entry nobody observes is still in the cache when it is next persisted. A finite `gcTime` as long as the 30-day
 * maxAge cannot be used: it exceeds the largest `setTimeout` delay (2^31 - 1 ms, about 24.8 days), so browsers fire it
 * at once and the entry is dropped from the next blob. Only allowlisted, validated entries are hydrated (§5.4).
 */
export const PERSISTED_QUERY_GC_TIME_MS = Number.POSITIVE_INFINITY;

/** Writes of the persisted cache are throttled to one per second. */
export const PERSIST_THROTTLE_MS = SECOND_MS;

/**
 * Bound of one court policy JSON fetch, body included (D-37, D-19). The Ongoing list waits for the courts (§5.5), so a
 * gateway that never answers one policy would otherwise hold the whole page; a policy that misses the bound only leaves
 * that court's name unknown. A policy is a small JSON, so the bound sits well under the per-card budget of D-37.
 */
export const COURT_POLICY_FETCH_TIMEOUT_MS = 10 * SECOND_MS;

/** Stale times of ARCHITECTURE.md §5.3. */
export const STALE_TIME_MS = {
  /** Today's subcourt cache age (spec §2.2, §6.5). */
  courts: 3 * HOUR_MS,
  ongoing: MINUTE_MS,
  lookup: 30 * SECOND_MS,
  /** `memory-brief` meta-evidence results: failures are kept briefly, never retried on every render (D-38). */
  metaEvidenceBrief: 30 * SECOND_MS,
  disputeEventPending: MINUTE_MS,
  evidence: MINUTE_MS,
  details: 30 * SECOND_MS,
  multipliers: 10 * MINUTE_MS,
  funding: 30 * SECOND_MS,
  withdrawable: 30 * SECOND_MS,
  arbitrationCost: MINUTE_MS,
} as const;
