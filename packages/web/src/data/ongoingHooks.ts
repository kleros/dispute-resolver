import { listCourts, listOngoingDisputes, type ChainId, type Court, type MetaEvidenceResult, type OngoingDispute, type OngoingList } from "@dispute-resolver/core";
import { useQuery } from "@tanstack/react-query";
import { COURT_POLICY_FETCH_TIMEOUT_MS, PERSISTED_QUERY_GC_TIME_MS, STALE_TIME_MS } from "./constants";
import { useCoreDeps } from "./context";
import { withTimeout } from "./fetcher";
import { metaEvidenceQuery } from "./metaEvidenceQuery";
import { queryKeys } from "./queryKeys";
import { fromOutcome, fromQuery, ready, unavailableFrom } from "./sectionData";
import type { OngoingData, OngoingTitle, SectionData } from "./types";

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

function fromOngoingList(list: OngoingList): SectionData<OngoingList> {
  return list.status === "failed" ? unavailableFrom(list.error) : ready(list);
}

/** Starts once the courts have settled, with or without them, so a cold load scans once instead of twice. */
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

export function useOngoingTitle(chainId: ChainId, dispute: OngoingDispute): SectionData<OngoingTitle> {
  const deps = useCoreDeps();
  const query = useQuery(metaEvidenceQuery(deps, chainId, { disputeId: dispute.id, arbitrable: dispute.arbitrated }, "ongoing"));
  return fromQuery(query, ongoingTitle);
}

export function useOngoing(chainId: ChainId): OngoingData {
  return { list: useOngoingList(chainId), courts: useCourts(chainId) };
}
