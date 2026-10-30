import { describeError, isContractFailure, readFailure } from "./rpc";
import type { Outcome, Unavailable, UnavailableCode } from "./types";

export const NETWORK_DATA_UNAVAILABLE = "This network's data is unavailable.";

export function succeed<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

export function fail<T>(code: UnavailableCode, message: string): Outcome<T> {
  return { ok: false, error: { code, message } };
}

export function failedRead<T>(what: string, error: unknown, chainId: number): Outcome<T> {
  return { ok: false, error: readFailure(what, error, chainId) };
}

export function callFailure(error: unknown, chainId: number): Unavailable {
  return { code: isContractFailure(error) ? "reverted" : "rpc-error", message: describeError(error, chainId) };
}

/** Never rejects. */
export async function readOutcome<T>(what: string, chainId: number, read: () => Promise<T>, signal: AbortSignal | undefined): Promise<Outcome<T>> {
  try {
    signal?.throwIfAborted();
    return succeed(await read());
  } catch (error) {
    return failedRead(what, error, chainId);
  }
}
