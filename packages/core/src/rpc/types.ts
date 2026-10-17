import type { ChainId, ReadClient } from "../types";

/** Transport limits of a read client built by `createReadClient`. */
export interface ReadClientOptions {
  /** Per JSON-RPC request; default 20,000 ms (the Reality lookup's value, spec 9.1). */
  readonly timeoutMs?: number;
  /** Retries of a failed request, except an `eth_getLogs` range-limit refusal; default 2, after 500 ms and 2 s. */
  readonly retryCount?: number;
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
