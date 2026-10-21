import type { ChainId, Outcome, Unavailable, UnavailableCode } from "@dispute-resolver/core";
import type { UseQueryResult } from "@tanstack/react-query";
import type { SectionData } from "./types";

export type LoadingSection = Extract<SectionData<never>, { readonly status: "loading" }>;
export type UnavailableSection = Extract<SectionData<never>, { readonly status: "unavailable" }>;

export const LOADING: LoadingSection = Object.freeze({ status: "loading" });

export function ready<T>(value: T): SectionData<T> {
  return { status: "ready", value };
}

export function unavailable(code: UnavailableCode, message: string): UnavailableSection {
  return { status: "unavailable", error: { code, message } };
}

export function unavailableFrom(error: Unavailable): UnavailableSection {
  return { status: "unavailable", error };
}

/** A chain without a read RPC is a section state, never an exception; the code keeps the cause diagnosable. */
export function noRpcError(chainId: ChainId): Unavailable {
  return { code: "no-rpc", message: `Reads on chain ${String(chainId)} are unavailable.` };
}

export function fromOutcome<T>(outcome: Outcome<T>): SectionData<T> {
  return outcome.ok ? ready(outcome.value) : unavailableFrom(outcome.error);
}

/** A rejected read is `rpc-error` with its message (ARCHITECTURE.md §5.3); hooks never throw to React. */
export function rejectionError(error: unknown): Unavailable {
  const message = error instanceof Error && error.message !== "" ? error.message : "The read failed.";
  return { code: "rpc-error", message };
}

/**
 * Maps a query to `SectionData`: pending (fetching or waiting for its inputs) is `loading`, a rejection is
 * `unavailable`, and data goes through `map`, which turns a core `Outcome` or result union into the section state.
 */
export function fromQuery<TData, TValue>(query: UseQueryResult<TData>, map: (data: TData) => SectionData<TValue>): SectionData<TValue> {
  if (query.status === "error") return unavailableFrom(rejectionError(query.error));
  if (query.status === "pending") return LOADING;
  return map(query.data);
}

/** The value when ready, else `undefined`. */
export function valueOf<T>(section: SectionData<T>): T | undefined {
  return section.status === "ready" ? section.value : undefined;
}
