import type { ChainConfig } from "@dispute-resolver/core";
import { useMemo } from "react";
import { useCaseRefresh, type CaseDispute, type CaseWriteContext, type RefreshScope } from "../../data";

export interface AppealActions {
  readonly pageChainId: number;
  readonly context: CaseWriteContext | null;
  refresh(scope: RefreshScope): Promise<void>;
}

export function useAppealActions(dispute: CaseDispute, chain: ChainConfig): AppealActions {
  const refresh = useCaseRefresh(dispute.chainId, dispute.disputeId);
  const context = dispute.write.status === "ready" ? dispute.write.value : null;
  return useMemo(() => ({ pageChainId: chain.id, context, refresh }), [chain.id, context, refresh]);
}
