/**
 * A logical lookup ran out of its request budget or deadline. Never retried and never a range-limit error: splitting the
 * range would only spend more of a budget that is already gone.
 */
export class LookupLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookupLimitError";
  }
}

export function isLookupLimitError(error: unknown): error is LookupLimitError {
  return error instanceof LookupLimitError;
}

/** How deep a chain of `cause`s is followed; viem wraps a transport error at most a few times. */
const MAX_CAUSE_DEPTH = 8;

/** `error` and its `cause`s, outermost first. A link that is not an object ends the chain, and is its last element. */
export function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  while (current !== undefined && current !== null && chain.length < MAX_CAUSE_DEPTH) {
    chain.push(current);
    current = typeof current === "object" && "cause" in current ? current.cause : undefined;
  }
  return chain;
}
