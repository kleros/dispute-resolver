import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback } from "react";
import { disputeKeyPrefix, queryKeys } from "./queryKeys";
import type { RefreshScope } from "./types";

type RefreshedKind = Parameters<typeof disputeKeyPrefix>[0];

/**
 * `appeal` refreshes `details` too, for the values core reads together with the dispute (`currentRuling`, `appealCost`,
 * `appealPeriod`, `RulingFunded`), the executed ruling the decision shows, and the chain time its deadlines count down
 * from; the current round's funding is rescanned over the same range as the first load.
 */
const REFRESHED: Readonly<Record<RefreshScope, readonly RefreshedKind[]>> = {
  evidence: ["lookup", "evidence"],
  appeal: ["lookup", "details", "evidence", "funding", "executedRuling"],
  withdraw: ["withdrawable"],
};

/**
 * For the write flow's `onMined`: call it only once the receipt is mined, never on submission. Resolves when the
 * refreshed sections have been read again.
 */
export function useCaseRefresh(chainId: number, disputeId: bigint): (scope: RefreshScope) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    async (scope: RefreshScope) => {
      const keys: QueryKey[] = REFRESHED[scope].map((kind) => disputeKeyPrefix(kind, chainId, disputeId));
      if (scope === "appeal") keys.push(queryKeys.chainTime(chainId));
      await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
    },
    [client, chainId, disputeId],
  );
}
