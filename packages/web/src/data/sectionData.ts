import { describeError, type MetaEvidence, type MetaEvidenceResult, type Outcome, type Unavailable, type UnavailableCode } from "@dispute-resolver/core";
import type { UseQueryResult } from "@tanstack/react-query";
import type { CaseDispute, FoundLookup, SectionData } from "./types";

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
export function noRpcError(chainId: number): Unavailable {
  return { code: "no-rpc", message: `Reads on chain ${String(chainId)} are unavailable.` };
}

export function fromOutcome<T>(outcome: Outcome<T>): SectionData<T> {
  return outcome.ok ? ready(outcome.value) : unavailableFrom(outcome.error);
}

/** An `invalid` result still carries a placeholder meta-evidence, which is shown; `missing` is the caller's reason there is none. */
export function metaEvidenceSection(metaEvidence: SectionData<MetaEvidenceResult>, missing: string): SectionData<MetaEvidence> {
  if (metaEvidence.status !== "ready") return metaEvidence;
  const result = metaEvidence.value;
  switch (result.status) {
    case "ok":
    case "invalid":
      return ready(result.metaEvidence);
    case "missing":
      return unavailable("not-found", missing);
    case "failed":
      return unavailableFrom(result.error);
  }
}

/**
 * Hooks never throw to React: a rejected read becomes a section state. A viem error's full message carries the read
 * RPC's URL and with it the API key, so only its short message reaches the section.
 */
function rejectionError(error: unknown): Unavailable {
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

/** The arbitrator's record of the dispute once the lookup found it; the header renders from it before `view` settles. */
export function foundLookup(dispute: CaseDispute): FoundLookup | undefined {
  const { lookup } = dispute;
  return lookup.status === "ready" && lookup.value.status === "found" ? lookup.value : undefined;
}
