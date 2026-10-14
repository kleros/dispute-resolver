import type { ChainConfig, ChainId } from "@dispute-resolver/core";
import { useMemo } from "react";
import { useCaseRefresh, type CaseDispute, type CaseWriteContext, type RefreshScope } from "../../data";

/** What every appeal action needs: the page chain the wallet must be on (B3), the write context, and the refresh. */
export interface AppealActions {
  readonly pageChainId: ChainId;
  /** The binding, family and local ID the write builders take (A22); `null` while it loads or when it failed. */
  readonly context: CaseWriteContext | null;
  /** The refresh a mined write asks for (ARCHITECTURE.md §5.6, D-07, P-02). */
  refresh(scope: RefreshScope): Promise<void>;
}

export function useAppealActions(dispute: CaseDispute, chain: ChainConfig): AppealActions {
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const context = dispute.write.status === "ready" ? dispute.write.value : null;
  return useMemo(() => ({ pageChainId: chain.id, context, refresh }), [chain.id, context, refresh]);
}
