import type { ChainId } from "@dispute-resolver/core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { disputeKeyPrefix } from "./queryKeys";
import type { RefreshScope } from "./types";

type RefreshedKind = Parameters<typeof disputeKeyPrefix>[0];

/**
 * What each mined write refreshes (ARCHITECTURE.md §5.6). `appeal` is spec §5.3 `reload()` plus the values core reads
 * together with them (`currentRuling`, `appealCost`, `appealPeriod`, `RulingFunded`), proposal P-02; the current
 * round's funding is rescanned over the same range as the first load (D-02). `withdraw` is P-02's withdrawable refresh.
 */
const REFRESHED: Readonly<Record<RefreshScope, readonly RefreshedKind[]>> = {
  evidence: ["lookup", "evidence"],
  appeal: ["lookup", "details", "evidence", "funding"],
  withdraw: ["withdrawable"],
};

/**
 * `refresh(scope)` for the write flow's `onMined`, called only once the receipt is mined (D-07: no reload on
 * submission). Resolves when the refreshed sections have been read again.
 */
export function useCaseRefresh(chainId: ChainId, disputeId: bigint): (scope: RefreshScope) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    async (scope: RefreshScope) => {
      await Promise.all(REFRESHED[scope].map((kind) => client.invalidateQueries({ queryKey: disputeKeyPrefix(kind, chainId, disputeId) })));
    },
    [client, chainId, disputeId],
  );
}
