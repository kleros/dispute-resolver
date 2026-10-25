import { readFailure } from "../rpc";
import type { ChainId, Outcome, UnavailableCode } from "../types";

function succeed<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

export function fail<T>(code: UnavailableCode, message: string): Outcome<T> {
  return { ok: false, error: { code, message } };
}

/** A contract read on `chainId` as an `Outcome`: never rejects; a failure is `reverted` or `rpc-error` with a safe reason. */
export async function readOutcome<T>(what: string, chainId: ChainId, read: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return succeed(await read());
  } catch (error) {
    return { ok: false, error: readFailure(what, error, chainId) };
  }
}
