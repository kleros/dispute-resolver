import { describeError, type ChainId, type Outcome, type Unavailable, type UnavailableCode } from "@dispute-resolver/core";
import type { UseQueryResult } from "@tanstack/react-query";
import type { SectionData } from "./types";

type LoadingSection = Extract<SectionData<never>, { readonly status: "loading" }>;
type UnavailableSection = Extract<SectionData<never>, { readonly status: "unavailable" }>;

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

/**
 * Hooks never throw to React: a rejected read becomes a section state. A viem error's full message carries the read
 * RPC's URL and with it the API key, so only its short message reaches the section.
 */
export function rejectionError(error: unknown): Unavailable {
  return { code: "rpc-error", message: describeError(error) };
}

/** A query waiting for its inputs (`skipToken`) is also `pending`, so it reads as `loading`. */
export function fromQuery<TData, TValue>(query: UseQueryResult<TData>, map: (data: TData) => SectionData<TValue>): SectionData<TValue> {
  if (query.status === "error") return unavailableFrom(rejectionError(query.error));
  if (query.status === "pending") return LOADING;
  return map(query.data);
}

export function valueOf<T>(section: SectionData<T>): T | undefined {
  return section.status === "ready" ? section.value : undefined;
}
