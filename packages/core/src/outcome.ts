import { readFailure } from "./rpc";
import type { Outcome, UnavailableCode } from "./types";

export const NETWORK_DATA_UNAVAILABLE = "This network's data is unavailable.";

export function succeed<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

export function fail<T>(code: UnavailableCode, message: string): Outcome<T> {
  return { ok: false, error: { code, message } };
}

/** The failed `Outcome` of a read on `chainId` that threw. */
export function failedRead<T>(what: string, error: unknown, chainId: number): Outcome<T> {
  return { ok: false, error: readFailure(what, error, chainId) };
}

/**
 * A contract read on `chainId` as an `Outcome`: never rejects, a failure keeps its kind (`reverted` or `rpc-error`) and a
 * safe reason.
 */
export async function readOutcome<T>(what: string, chainId: number, read: () => Promise<T>, signal: AbortSignal | undefined): Promise<Outcome<T>> {
  try {
    signal?.throwIfAborted();
    return succeed(await read());
  } catch (error) {
    return failedRead(what, error, chainId);
  }
}
