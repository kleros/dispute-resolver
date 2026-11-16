import { loadEvidenceEntry, type EvidenceEntry, type EvidenceList, type EvidencePageRequest, type Outcome } from "@dispute-resolver/core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { EVIDENCE_FETCH_TIMEOUT_MS } from "./constants";
import { useCoreDeps } from "./context";
import { withTimeout } from "./fetcher";
import { queryKeys } from "./queryKeys";
import { foundLookup } from "./sectionData";
import type { CaseDispute } from "./types";

export interface EvidenceEntryRetry {
  /**
   * Reads a `fetch-failed` entry's file again and puts what it gives in that entry's place in the held page. Resolves
   * with it, or with `null` when the result is dropped: another page, order or scan aborts the read, and a page read that
   * replaced the held entries meanwhile drops it.
   */
  readonly tryAgain: (entry: EvidenceEntry) => Promise<EvidenceEntry | null>;
  readonly isRetrying: (entry: EvidenceEntry) => boolean;
  /**
   * What a row shows for `entry`: a file Try again loaded keeps what it gave when its page is read again later and that
   * read does not load it, since the page keeps only its own documents and a content-addressed file never changes.
   */
  readonly shown: (entry: EvidenceEntry) => EvidenceEntry;
}

function loadedKey(entry: EvidenceEntry, uri: string): string {
  return `${entry.blockNumber.toString()}:${String(entry.logIndex)}:${uri}`;
}

interface Running {
  readonly entry: EvidenceEntry;
  readonly controller: AbortController;
}

/** Each Try again reads one file: every other entry, the page and the logs stay as they are. */
export function useEvidenceEntryRetry(dispute: CaseDispute, request: EvidencePageRequest): EvidenceEntryRetry {
  const deps = useCoreDeps();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<readonly Running[]>([]);
  const [loaded, setLoaded] = useState<ReadonlyMap<string, EvidenceEntry>>(() => new Map());
  const inScope = useRef(new Set<AbortController>());
  const logs = dispute.evidence.status === "ready" ? dispute.evidence.value.logs : undefined;
  const binding = foundLookup(dispute)?.binding;
  const event = dispute.disputeEvent.status === "ready" && dispute.disputeEvent.value.status === "found" ? dispute.disputeEvent.value.event : undefined;
  const { chainId } = dispute;
  const { order, page } = request;

  // Keyed on the logs, not the list: writing an entry gives the query a new list with the same logs.
  useEffect(() => {
    const controllers = new Set<AbortController>();
    inScope.current = controllers;
    return () => {
      for (const controller of controllers) controller.abort();
    };
  }, [logs, order, page]);

  const tryAgain = useCallback(
    async (entry: EvidenceEntry): Promise<EvidenceEntry | null> => {
      const log = logs?.find((candidate) => candidate.blockNumber === entry.blockNumber && candidate.logIndex === entry.logIndex);
      if (entry.status !== "fetch-failed" || log === undefined || binding === undefined || event === undefined) return null;
      const key = queryKeys.evidence(chainId, binding.disputeId, binding.arbitrated, event.evidenceGroupId);
      const run: Running = { entry, controller: new AbortController() };
      const controllers = inScope.current;
      controllers.add(run.controller);
      setRunning((current) => [...current, run]);
      try {
        const context = { fetcher: withTimeout(deps.fetcher, EVIDENCE_FETCH_TIMEOUT_MS), gateway: deps.gateway, signal: run.controller.signal };
        const next = await loadEvidenceEntry(context, log, entry.evidence.timestamp);
        if (run.controller.signal.aborted) return null;
        const held = queryClient.getQueryData<Outcome<EvidenceList>>(key);
        if (held?.ok !== true || !held.value.entries.includes(entry)) return null;
        if (next.status !== entry.status) {
          const updated: Outcome<EvidenceList> = { ok: true, value: { ...held.value, entries: held.value.entries.map((other) => (other === entry ? next : other)) } };
          queryClient.setQueryData(key, updated);
          setLoaded((current) => new Map(current).set(loadedKey(entry, entry.evidence.uri), next));
        }
        return next;
      } finally {
        controllers.delete(run.controller);
        setRunning((current) => current.filter((other) => other !== run));
      }
    },
    [binding, chainId, deps.fetcher, deps.gateway, event, logs, queryClient],
  );

  const isRetrying = useCallback((entry: EvidenceEntry) => running.some((run) => run.entry === entry && !run.controller.signal.aborted), [running]);

  const shown = useCallback((entry: EvidenceEntry) => (entry.status === "fetch-failed" ? (loaded.get(loadedKey(entry, entry.evidence.uri)) ?? entry) : entry), [loaded]);

  return { tryAgain, isRetrying, shown };
}
