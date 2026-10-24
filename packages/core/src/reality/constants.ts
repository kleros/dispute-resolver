import type { RealityLookupLimits } from "./types";

/** The read clients spend the request budget and the deadline on every attempt, retries included. */
export const LOOKUP_LIMITS: RealityLookupLimits = {
  deadlineMs: 90_000, // Per lookup.
  requestBudget: 1500, // Per lookup, retries included.
  windowSize: 10_000, // First eth_getLogs window when the whole range is refused.
  minWindowSize: 100,
  windowShrinkFactor: 5,
  concurrency: 8,
};

/** Separates the parameters of a Reality.eth question (U+241F). */
export const QUESTION_PARAMS_DELIMITER = "␟";
