import { readFailure } from "../rpc";
import type { Outcome, UnavailableCode } from "../types";

export function succeed<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

export function fail<T>(code: UnavailableCode, message: string): Outcome<T> {
  return { ok: false, error: { code, message } };
}

/** A contract read as an `Outcome`: never rejects, a failure keeps its kind (`reverted` or `rpc-error`) and a safe reason. */
export async function readOutcome<T>(what: string, read: () => Promise<T>, signal: AbortSignal | undefined): Promise<Outcome<T>> {
  try {
    signal?.throwIfAborted();
    return succeed(await read());
  } catch (error) {
    return { ok: false, error: readFailure(what, error) };
  }
}
