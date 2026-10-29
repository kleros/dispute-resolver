import {
  readMultipliers,
  readProductFunding,
  readsProductFunding,
  readRoundFunding,
  readWithdrawable,
  type Address,
  type AppealContext,
  type ArbitratedBinding,
  type FamilyDetection,
  type Multipliers,
  type RoundFunding,
  type WithdrawState,
} from "@dispute-resolver/core";
import { skipToken, useQuery } from "@tanstack/react-query";
import { STALE_TIME_MS } from "./constants";
import { useCoreDeps } from "./context";
import { IDLE_KEY, queryKeys } from "./queryKeys";
import { LOADING, fromOutcome, fromQuery, noRpcError, ready, unavailableFrom } from "./sectionData";
import type { SectionData } from "./types";

export function useMultipliers(chainId: number, family: FamilyDetection | undefined): SectionData<Multipliers> {
  const deps = useCoreDeps();
  const client = deps.getReadClient(chainId);
  const query = useQuery({
    queryKey: family === undefined ? IDLE_KEY : queryKeys.multipliers(chainId, family.arbitrable),
    queryFn: family === undefined || client === undefined ? skipToken : () => readMultipliers(client, family),
    staleTime: STALE_TIME_MS.multipliers,
  });
  if (family === undefined) return LOADING;
  if (client === undefined) return unavailableFrom(noRpcError(chainId));
  return fromQuery(query, fromOutcome);
}

/** Scans from the round's start block to the latest block on every read, so a reload shows the same totals. */
export function useRoundFunding(context: AppealContext | undefined, round: bigint | undefined, fromBlock: bigint | undefined): SectionData<RoundFunding> {
  const enabled = context !== undefined && round !== undefined && fromBlock !== undefined;
  const query = useQuery({
    queryKey: enabled ? queryKeys.funding(context.binding.chainId, context.binding.disputeId, round, fromBlock, context.evidenceGroupId) : IDLE_KEY,
    queryFn: enabled ? ({ signal }) => readRoundFunding({ ...context, signal }, round, fromBlock) : skipToken,
    staleTime: STALE_TIME_MS.funding,
  });
  return enabled ? fromQuery(query, fromOutcome) : LOADING;
}

/**
 * The last round's fully funded rulings from the arbitrable's own record, for a family whose funding the Dispute
 * Resolver does not read itself; `null` for any other family, or while the decision does not depend on them.
 */
export function useProductFunding(
  chainId: number,
  binding: ArbitratedBinding | undefined,
  family: FamilyDetection | undefined,
  needed: boolean,
): SectionData<readonly bigint[]> | null {
  const deps = useCoreDeps();
  const client = deps.getReadClient(chainId);
  const wanted = needed && binding !== undefined && family !== undefined && readsProductFunding(family);
  const query = useQuery({
    queryKey: wanted ? queryKeys.productFunding(chainId, binding.disputeId) : IDLE_KEY,
    queryFn: wanted && client !== undefined ? ({ signal }) => readProductFunding(client, binding, family, signal) : skipToken,
    staleTime: STALE_TIME_MS.funding,
  });
  if (!wanted) return null;
  if (client === undefined) return unavailableFrom(noRpcError(chainId));
  return fromQuery(query, fromOutcome);
}

export function useWithdrawable(
  context: AppealContext | undefined,
  account: Address | undefined,
  rounds: readonly bigint[],
  starts: readonly bigint[],
): SectionData<WithdrawState> {
  const query = useQuery({
    queryKey: context === undefined ? IDLE_KEY : queryKeys.withdrawable(context.binding.chainId, context.binding.disputeId, account, rounds, context.evidenceGroupId),
    queryFn: context === undefined ? skipToken : ({ signal }) => readWithdrawable({ ...context, signal }, { beneficiary: account, rounds, roundStartBlocks: starts }),
    staleTime: STALE_TIME_MS.withdrawable,
  });
  return context === undefined ? LOADING : fromQuery(query, ready);
}
