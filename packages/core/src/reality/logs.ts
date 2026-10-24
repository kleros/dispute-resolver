import type { Hex } from "../types";

/** The one log of `logs`; anything else is an error, because every lookup of the pipeline is for a unique event. */
export function requireSingleLog<TLog>(logs: readonly TLog[], what: string): TLog {
  const [log] = logs;
  if (logs.length !== 1 || log === undefined) throw new Error(`Expected exactly one ${what} log, found ${String(logs.length)}.`);
  return log;
}

/** The block of a mined log. */
export function blockOf(log: { readonly blockNumber: bigint | null }): bigint {
  if (log.blockNumber === null) throw new Error("Unexpected pending log.");
  return log.blockNumber;
}

/** A decoded bytes32 argument of a log, which a log that does not match its ABI lacks. */
export function requireHex(value: Hex | undefined, what: string): Hex {
  if (value === undefined) throw new Error(`Malformed ${what} log.`);
  return value;
}
