import { readFailure } from "../rpc";
import type { ChainId, Outcome, Unavailable, UnavailableCode } from "../types";

export function succeed<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

export function fail<T>(code: UnavailableCode, message: string): Outcome<T> {
  return { ok: false, error: { code, message } };
}

export function unavailable(code: UnavailableCode, message: string): Unavailable {
  return { code, message };
}

/** The failed `Outcome` of a read on `chainId` that threw. */
export function failedRead<T>(what: string, error: unknown, chainId: ChainId): Outcome<T> {
  return { ok: false, error: readFailure(what, error, chainId) };
}
