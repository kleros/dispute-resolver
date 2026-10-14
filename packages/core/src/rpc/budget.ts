import { LookupLimitError } from "./errors";
import type { RequestBudget } from "./types";

/**
 * A request count and a deadline shared by every request of one logical lookup (spec 9.1: the Reality lookup's 1,500
 * requests and 90 s). The deadline starts when the budget is created.
 */
export function createRequestBudget(limits: { readonly maxRequests: number; readonly deadlineMs: number }): RequestBudget {
  const deadline = Date.now() + limits.deadlineMs;
  let spent = 0;
  return {
    spend() {
      if (spent >= limits.maxRequests) throw new LookupLimitError(`Request budget of ${String(limits.maxRequests)} requests exceeded.`);
      if (Date.now() > deadline) throw new LookupLimitError(`Request ${String(limits.deadlineMs)} ms deadline exceeded.`);
      spent += 1;
    },
    remainingMs() {
      return Math.max(0, deadline - Date.now());
    },
  };
}
