import type { ChainId, ReadClient } from "../types";

/** Transport limits of a read client built by `createReadClient`. */
export interface ReadClientOptions {
  /** Per JSON-RPC request; default 20,000 ms (the Reality lookup's value, spec 9.1). */
  readonly timeoutMs?: number;
  /** Retries of a failed request, except an `eth_getLogs` range-limit refusal; default 2, after 500 ms and 2 s. */
  readonly retryCount?: number;
  /**
   * JSON-RPC batching (viem `batch`); default off, so each request is its own HTTP request with its own timeout, as in
   * spec 9.1. When on, requests of the same tick share one HTTP request and its timeout.
   */
  readonly batch?: boolean;
}

/** The options of a read client built for one logical lookup, which may carry that lookup's request budget. */
export interface BudgetedReadClientOptions extends ReadClientOptions {
  /**
   * Spent before every attempt of every request, retries included, so the lookup's request count and deadline bound
   * what is actually sent (spec 9.1). A `LookupLimitError` from it is never retried.
   */
  readonly budget?: RequestBudget;
}

export type ReadClientResolution = { readonly status: "ok"; readonly client: ReadClient } | { readonly status: "unconfigured"; readonly chainId: ChainId };

/**
 * A shared request budget and deadline, created by `createRequestBudget` per logical lookup (a Reality question, a
 * meta-evidence load) and passed down. `spend` throws a `LookupLimitError` (never retried) once the request count or the
 * deadline is exceeded (spec 9.1).
 */
export interface RequestBudget {
  /** Counts one request; throws `LookupLimitError` when over budget or past the deadline. */
  spend(): void;
  /** Milliseconds left before the deadline, never negative. */
  remainingMs(): number;
}

/** Windowing parameters of the chunked log scans (the Reality lookup's constants, spec 9.1). */
export interface LogScanLimits {
  /** First window size when the whole range is refused; default 10,000 blocks. */
  readonly windowSize: number;
  /** Smallest window before giving up; default 100. */
  readonly minWindowSize: number;
  /** Divisor applied to the window after a refusal; default 5. */
  readonly windowShrinkFactor: number;
  /** Windows fetched in parallel; default 8. */
  readonly concurrency: number;
}
