import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { disputeKeyPrefix, queryKeys } from "./queryKeys";
import type { RefreshScope } from "./types";

type RefreshedRead = Parameters<typeof disputeKeyPrefix>[0] | "chainTime";

/** `appeal` refreshes what the panel and the decision derive from, and the chain time their deadlines count down from. */
const REFRESHED: Readonly<Record<RefreshScope, readonly RefreshedRead[]>> = {
  evidence: ["lookup", "evidence"],
  appeal: ["lookup", "details", "evidence", "funding", "executedRuling", "productFunding", "chainTime"],
  withdraw: ["withdrawable"],
};

/**
 * For the write flow's `onMined`: call it only once the receipt is mined, never on submission. Reads the whole scope
 * again and resolves when the reads in `waitFor` have been read again, every read of the scope when it is omitted.
 */
export function useCaseRefresh(chainId: number, disputeId: bigint): (scope: RefreshScope, waitFor?: readonly RefreshedRead[]) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    async (scope: RefreshScope, waitFor?: readonly RefreshedRead[]) => {
      const reads = REFRESHED[scope].map((read) => ({
        read,
        done: client.invalidateQueries({ queryKey: read === "chainTime" ? queryKeys.chainTime(chainId) : disputeKeyPrefix(read, chainId, disputeId) }),
      }));
      await Promise.all(reads.filter(({ read }) => waitFor?.includes(read) ?? true).map(({ done }) => done));
    },
    [client, chainId, disputeId],
  );
}
