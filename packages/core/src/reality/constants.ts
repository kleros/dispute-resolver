import type { RealityLookupLimits } from "./types";

/**
 * The request timeout and retry delays are enforced by the read clients (`rpc.createReadClient` defaults), not here; the
 * request budget and deadline are spent by those clients on every attempt, retries included.
 */
export const LOOKUP_LIMITS: RealityLookupLimits = {
  requestTimeoutMs: 20_000, // Per JSON-RPC request.
  deadlineMs: 90_000, // Per lookup.
  requestBudget: 1500, // Per lookup, retries included.
  retryDelaysMs: [500, 2000], // Backoff of the retries of non range-limit errors.
  windowSize: 10_000, // First eth_getLogs window when the whole range is refused.
  minWindowSize: 100,
  windowShrinkFactor: 5,
  concurrency: 8, // Windows fetched in parallel.
};

/** Separates the parameters of a Reality.eth question (U+241F). */
export const QUESTION_PARAMS_DELIMITER = "␟";
