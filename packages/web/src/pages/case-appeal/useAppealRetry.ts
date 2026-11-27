import { needsRulingOptions } from "@dispute-resolver/core";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback } from "react";
import { foundLookup, queryKeys, useCaseRefresh, type CaseDispute } from "../../data";
import type { RetryHandler } from "../../ui";

/**
 * The "appeal" refresh does not cover the multipliers, which keep a failed read as their data under a key of their
 * own, so they are invalidated too: unreadable multipliers are what the fees notice usually reports. The family, the
 * meta-evidence and the Dispute event are read again only when they did not load, so a Retry never repeats a log scan
 * or a meta-evidence fetch that succeeded; a meta-evidence whose script the gateway did not serve is read again while
 * the cards wait for its titles. The returned promise waits for every read that can be the panel's error, and for no
 * read the panel never shows: not the evidence, and not the meta-evidence of a panel that takes no ruling options.
 */
export function useAppealRetry(dispute: CaseDispute): RetryHandler {
  const client = useQueryClient();
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const { chainId, disputeId, family, metaEvidence, disputeEvent, appealHold } = dispute;
  const found = foundLookup(dispute);
  const arbitrable = found?.binding.arbitrated;
  const familyLoaded = family.status === "ready";
  const metaEvidenceLoaded = metaEvidence.status === "ready" && metaEvidence.value.status === "ok" && appealHold === null;
  const panelReadsMetaEvidence = found !== undefined && family.status === "ready" && needsRulingOptions(found.dispute.period, family.value);
  const eventFound = disputeEvent.status === "ready" && disputeEvent.value.status === "found";

  return useCallback(() => {
    const appeal = refresh("appeal", ["details", "funding"]);
    if (arbitrable === undefined) return appeal;
    const reread = (queryKey: QueryKey) => client.invalidateQueries({ queryKey });
    const awaited = [appeal, reread(queryKeys.multipliers(chainId, arbitrable))];
    if (!familyLoaded) awaited.push(reread(queryKeys.family(chainId, arbitrable)));
    if (!metaEvidenceLoaded) {
      const metaEvidenceRead = reread(queryKeys.metaEvidence(chainId, disputeId, arbitrable));
      if (panelReadsMetaEvidence) awaited.push(metaEvidenceRead);
    }
    if (!eventFound) awaited.push(reread(queryKeys.disputeEvent(chainId, disputeId, arbitrable)));
    return Promise.all(awaited);
  }, [arbitrable, chainId, client, disputeId, eventFound, familyLoaded, metaEvidenceLoaded, panelReadsMetaEvidence, refresh]);
}
