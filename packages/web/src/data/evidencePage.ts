import { evidencePage, loadEvidencePage, type EvidenceList, type EvidencePageRequest, type Outcome, type Unavailable } from "@dispute-resolver/core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { EVIDENCE_FETCH_TIMEOUT_MS } from "./constants";
import { useCoreDeps } from "./context";
import { withTimeout } from "./fetcher";
import { queryKeys } from "./queryKeys";
import { foundLookup } from "./sectionData";
import type { CaseDispute } from "./types";

export type EvidencePageState =
  { readonly status: "ready" } | { readonly status: "loading" } | { readonly status: "failed"; readonly error: Unavailable; readonly retry: () => void };

interface Failure {
  readonly list: EvidenceList;
  readonly order: EvidencePageRequest["order"];
  readonly page: number;
  readonly error: Unavailable;
}

function placeKey(place: { readonly blockNumber: bigint; readonly logIndex: number }): string {
  return `${place.blockNumber.toString()}:${String(place.logIndex)}`;
}

/** Whether `list` holds an entry for every log of the requested page, in whichever order it was read. */
function holdsPage(list: EvidenceList, request: EvidencePageRequest): boolean {
  const held = new Set(list.entries.map(placeKey));
  return evidencePage(list.logs, request).logs.every((log) => held.has(placeKey(log)));
}

/**
 * Reads the requested page of the case page's evidence into the evidence query in place of the page it holds, so one page
 * of documents is kept. A requested page the held documents already cover is read from them, and the query then names it
 * as its page, so a refresh reads the page shown. A newer request or list stops the read in flight, and a read whose list was replaced meanwhile
 * (a refresh) is dropped and run again on the new list. A failed read waits for `retry`.
 */
export function useEvidencePage(dispute: CaseDispute, request: EvidencePageRequest): EvidencePageState {
  const deps = useCoreDeps();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<Failure | null>(null);
  const list = dispute.evidence.status === "ready" ? dispute.evidence.value : undefined;
  const binding = foundLookup(dispute)?.binding;
  const event = dispute.disputeEvent.status === "ready" && dispute.disputeEvent.value.status === "found" ? dispute.disputeEvent.value.event : undefined;
  const client = deps.getReadClient(dispute.chainId);
  const { chainId } = dispute;
  const { order, page } = request;
  const needed = list !== undefined && !holdsPage(list, request);
  const failed = failure !== null && failure.list === list && failure.order === order && failure.page === page ? failure : null;
  // A failure of another page or list is dropped, so it holds no documents the evidence query no longer holds.
  if (failure !== null && failed === null) setFailure(null);

  useEffect(() => {
    if (list === undefined || binding === undefined || event === undefined || client === undefined) return undefined;
    const key = queryKeys.evidence(chainId, binding.disputeId, binding.arbitrated, event.evidenceGroupId);
    if (!needed) {
      const shown = evidencePage(list.logs, { order, page }).page;
      const held = queryClient.getQueryData<Outcome<EvidenceList>>(key);
      if ((list.page.order !== order || list.page.page !== shown) && held?.ok === true && held.value === list) {
        const synced: Outcome<EvidenceList> = { ok: true, value: { ...list, page: { order, page: shown } } };
        queryClient.setQueryData(key, synced);
      }
      return undefined;
    }
    if (failed !== null) return undefined;
    const controller = new AbortController();
    const context = { client, fetcher: withTimeout(deps.fetcher, EVIDENCE_FETCH_TIMEOUT_MS), gateway: deps.gateway, signal: controller.signal };
    void loadEvidencePage(context, list.logs, { order, page }).then((outcome) => {
      if (controller.signal.aborted) return;
      if (!outcome.ok) {
        setFailure({ list, order, page, error: outcome.error });
        return;
      }
      const held = queryClient.getQueryData<Outcome<EvidenceList>>(key);
      if (held?.ok === true && held.value === list) queryClient.setQueryData<Outcome<EvidenceList>>(key, outcome);
    });
    return () => {
      controller.abort();
    };
  }, [binding, chainId, client, deps.fetcher, deps.gateway, event, failed, list, needed, order, page, queryClient]);

  const retry = useCallback(() => {
    setFailure(null);
  }, []);

  if (!needed) return { status: "ready" };
  return failed === null ? { status: "loading" } : { status: "failed", error: failed.error, retry };
}
