import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryKeys, useCaseRefresh, type CaseDispute } from "../../data";

/**
 * The Retry of the appeal panel's notices (D-36, ARCHITECTURE.md §5.7): reads again what the panel is built from. The
 * "appeal" refresh reads the lookup, the details (appeal cost and period, current ruling, appeal decisions) and the
 * funding again. The multipliers keep a failed read as their data under a key of their own, so they are read again
 * too (06 §1: unreadable multipliers are what the fees notice usually reports). The family, the meta-evidence and the
 * Dispute event, which gives a governor its session (D-47), are read again only when they did not load, so a Retry
 * never repeats a log scan or a meta-evidence fetch that succeeded.
 */
export function useAppealRetry(dispute: CaseDispute): () => void {
  const client = useQueryClient();
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const { chainId, disputeId, lookup, family, metaEvidence, disputeEvent } = dispute;
  const arbitrable = lookup.status === "ready" && lookup.value.status === "found" ? lookup.value.binding.arbitrated : undefined;
  const familyLoaded = family.status === "ready";
  const metaEvidenceLoaded = metaEvidence.status === "ready" && metaEvidence.value.status === "ok";
  const eventFound = disputeEvent.status === "ready" && disputeEvent.value.status === "found";

  return useCallback(() => {
    void refresh("appeal");
    if (arbitrable === undefined) return;
    const keys: QueryKey[] = [queryKeys.multipliers(chainId, arbitrable)];
    if (!familyLoaded) keys.push(queryKeys.family(chainId, arbitrable));
    if (!metaEvidenceLoaded) keys.push(queryKeys.metaEvidence(chainId, disputeId, arbitrable));
    if (!eventFound) keys.push(queryKeys.disputeEvent(chainId, disputeId, arbitrable));
    for (const queryKey of keys) void client.invalidateQueries({ queryKey });
  }, [arbitrable, chainId, client, disputeId, eventFound, familyLoaded, metaEvidenceLoaded, refresh]);
}
