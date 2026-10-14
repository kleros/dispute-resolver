import {
  readMultipliers,
  readRoundFunding,
  readWithdrawable,
  type Address,
  type AppealContext,
  type ChainId,
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

/** The arbitrable's appeal multipliers (spec §10.9), read in the appeal period. `undefined` family: not read yet. */
export function useMultipliers(chainId: ChainId, family: FamilyDetection | undefined): SectionData<Multipliers> {
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

/**
 * Contributions and funded rulings of one round, scanned from the round's start block to the latest block on every
 * read, so a reload shows the same totals (D-02, D-30). Keyed by the context's governor session (D-47). `undefined`
 * inputs: not read yet.
 */
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
 * What `account` can withdraw across `rounds` (spec §5.15, D-46, D-49, D-51), each round scanned from its start block
 * in `starts`. Keyed by the account and the context's governor session (D-47), and never persisted. `undefined` context:
 * not read yet.
 */
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
