import type { ChainId, ReadClient } from "../types";

export interface ReadClientOptions {
  /** Per JSON-RPC request; default 20,000 ms. */
  readonly timeoutMs?: number;
  /** Retries of a failed request, except an `eth_getLogs` range-limit refusal; default 2, after 500 ms and 2 s. */
  readonly retryCount?: number;
}

export interface BudgetedReadClientOptions extends ReadClientOptions {
  /**
   * Spent before every attempt of every request, retries included, so the lookup's request count and deadline bound
   * what is actually sent.
   */
  readonly budget?: RequestBudget;
}

export type ReadClientResolution = { readonly status: "ok"; readonly client: ReadClient } | { readonly status: "unconfigured"; readonly chainId: ChainId };

/** One per logical lookup (a Reality question, a meta-evidence load), passed down to every read it makes. */
export interface RequestBudget {
  /** Throws a `LookupLimitError`, which is never retried, when over budget or past the deadline. */
  spend(): void;
  /** Milliseconds left before the deadline, never negative. */
  remainingMs(): number;
}
