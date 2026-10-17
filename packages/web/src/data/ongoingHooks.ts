import { listCourts, listOngoingDisputes, type ChainId, type Court, type MetaEvidenceResult, type OngoingDispute, type OngoingList } from "@dispute-resolver/core";
import { useQuery } from "@tanstack/react-query";
import { COURT_POLICY_FETCH_TIMEOUT_MS, PERSISTED_QUERY_GC_TIME_MS, STALE_TIME_MS } from "./constants";
import { useCoreDeps } from "./context";
import { withTimeout } from "./fetcher";
import { metaEvidenceQuery } from "./metaEvidenceQuery";
import { queryKeys } from "./queryKeys";
import { fromOutcome, fromQuery, ready, unavailableFrom } from "./sectionData";
import type { OngoingData, OngoingTitle, SectionData } from "./types";

/**
 * The courts of the chain with their policy names (spec §6.1, D-19). Stale after 3 h; an `ok` list is persisted.
 * `listCourts` fetches only the policy JSONs, each bounded by `COURT_POLICY_FETCH_TIMEOUT_MS`, so a stalled gateway
 * leaves a name unknown instead of holding the Ongoing list, which waits for the courts (D-37).
 */
export function useCourts(chainId: ChainId): SectionData<readonly Court[]> {
  const deps = useCoreDeps();
  const query = useQuery({
    queryKey: queryKeys.courts(chainId),
    queryFn: ({ signal }) => listCourts({ chainId, client: deps.getReadClient(chainId), fetcher: withTimeout(deps.fetcher, COURT_POLICY_FETCH_TIMEOUT_MS), env: deps.env, signal }),
    staleTime: STALE_TIME_MS.courts,
    // Never collected, so the list is still in the cache when it is next persisted.
    gcTime: PERSISTED_QUERY_GC_TIME_MS,
  });
  return fromQuery(query, fromOutcome);
}

/** A failed scan is the section's `unavailable` state; `ready` is the list or the chain's `no-arbitrator` state. */
function fromOngoingList(list: OngoingList): SectionData<OngoingList> {
  return list.status === "failed" ? unavailableFrom(list.error) : ready(list);
}

/**
 * The open disputes of the chain (spec §3, D-37). Starts once the courts have settled, with or without them, so a
 * cold load scans once instead of twice; refetches when the chain changes (its key holds the chain).
 */
export function useOngoingList(chainId: ChainId): SectionData<OngoingList> {
  const deps = useCoreDeps();
  const courts = useCourts(chainId);
  const courtList = courts.status === "ready" ? courts.value : null;
  const query = useQuery({
    queryKey: queryKeys.ongoing(chainId, courtList === null ? "none" : "ok"),
    queryFn: ({ signal }) => listOngoingDisputes({ chainId, client: deps.getReadClient(chainId), signal }, courtList),
    enabled: courts.status !== "loading",
    staleTime: STALE_TIME_MS.ongoing,
  });
  return fromQuery(query, fromOngoingList);
}

/**
 * A card's title from its own meta-evidence (spec §3, D-37): an `ok` title; `missing` ("Meta Evidence Missing", as
 * today) when the title is empty or the locator knows no meta-evidence; the placeholder title of an `invalid` one (A2);
 * and for a failed load the hook's `unavailable` state, rendered as the dispute ID with "title unavailable" (D-37).
 */
export function ongoingTitle(result: MetaEvidenceResult): SectionData<OngoingTitle> {
  switch (result.status) {
    case "ok":
      return ready(result.metaEvidence.title === "" ? { kind: "missing" } : { kind: "title", text: result.metaEvidence.title });
    case "invalid":
      return ready({ kind: "title", text: result.metaEvidence.title });
    case "missing":
      return ready({ kind: "missing" });
    case "failed":
      return unavailableFrom(result.error);
  }
}

/** The title of one Ongoing card, loaded with the Ongoing budget (D-37, D-38) under the shared meta-evidence key. */
export function useOngoingTitle(chainId: ChainId, dispute: OngoingDispute): SectionData<OngoingTitle> {
  const deps = useCoreDeps();
  const query = useQuery(metaEvidenceQuery(deps, chainId, { disputeId: dispute.id, arbitrable: dispute.arbitrated }, "ongoing"));
  return fromQuery(query, ongoingTitle);
}

/** Everything the Ongoing page renders above its cards. */
export function useOngoing(chainId: ChainId): OngoingData {
  return { list: useOngoingList(chainId), courts: useCourts(chainId) };
}
