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
