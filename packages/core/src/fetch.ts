/**
 * Thrown by an injected fetcher for a body larger than it reads, before the request settles when the declared length
 * says so, otherwise while the body streams. Deterministic: the same document would fail again, so no pipeline retries it.
 */
export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`The file is larger than ${String(maxBytes)} bytes.`);
    this.name = "BodyTooLargeError";
  }
}

export function isBodyTooLargeError(error: unknown): error is BodyTooLargeError {
  return error instanceof Error && error.name === "BodyTooLargeError";
}
