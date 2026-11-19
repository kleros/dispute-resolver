import { getChain, isEip7702Delegation, readArbitrationCost, readLowGasPayout, type Address, type Hex, type LowGasPayout, type ReadClient } from "@dispute-resolver/core";
import { skipToken, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { STALE_TIME_MS } from "./constants";
import { useCoreDeps } from "./context";
import { IDLE_KEY, queryKeys } from "./queryKeys";
import { LOADING, fromOutcome, fromQuery, noRpcError, ready, unavailable, unavailableFrom } from "./sectionData";
import type { SectionData } from "./types";

export function useArbitrationCost(chainId: number, extraData: Hex | undefined): SectionData<bigint> {
  const deps = useCoreDeps();
  const chain = getChain(chainId);
  const client = deps.getReadClient(chainId);
  const query = useQuery({
    queryKey: extraData === undefined ? IDLE_KEY : queryKeys.cost(chainId, extraData),
    queryFn: extraData === undefined || chain === undefined || client === undefined ? skipToken : () => readArbitrationCost(client, chain, extraData),
    staleTime: STALE_TIME_MS.arbitrationCost,
  });
  if (extraData === undefined) return LOADING;
  if (chain === undefined) return unavailable("unsupported", `Chain ${String(chainId)} is not supported.`);
  if (client === undefined) return unavailableFrom(noRpcError(chainId));
  return fromQuery(query, fromOutcome);
}

/** EIP-7702 delegated EOAs are not smart-contract wallets. */
function isContractCode(code: Hex): boolean {
  return code !== "0x" && !isEip7702Delegation(code);
}

/** One read of the account's code serves the contract-wallet check and the payout check. */
function useAccountCode(chainId: number, account: Address | undefined): { readonly client: ReadClient | undefined; readonly query: UseQueryResult<Hex> } {
  const client = useCoreDeps().getReadClient(chainId);
  const query = useQuery({
    queryKey: account === undefined ? IDLE_KEY : queryKeys.accountCode(chainId, account),
    queryFn: account === undefined || client === undefined ? skipToken : () => client.getCode({ address: account }).then((code) => code ?? "0x"),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return { client, query };
}

/** Without an account, an RPC or a successful read the answer is `false`, so a failed read hides the warning. */
export function useIsContractAccount(chainId: number, account: Address | undefined): SectionData<boolean> {
  const { client, query } = useAccountCode(chainId, account);
  if (account === undefined || client === undefined) return ready(false);
  if (query.status === "error") return ready(false);
  return query.status === "pending" ? LOADING : ready(isContractCode(query.data));
}

/** Rejects, so a check that could not tell is not kept and runs again for the next caller that mounts. */
function settledPayout(payout: LowGasPayout): LowGasPayout {
  if (payout === "unknown") throw new Error("The payout check could not tell.");
  return payout;
}

/**
 * `true` only once the check found that a 2300-gas transfer, as the appeal contracts send refunds and rewards, does not
 * reach the account. The check runs for an EIP-7702 delegation only, once per chain, account and delegation; the code is
 * read once per session. While it runs, and when it or the code read fails, the answer is `false`, so a failed read never
 * warns.
 */
export function useCannotReceivePayout(chainId: number, account: Address | undefined): boolean {
  const { client, query } = useAccountCode(chainId, account);
  const delegation = query.status === "success" && isEip7702Delegation(query.data) ? query.data : undefined;
  const payout = useQuery({
    queryKey: account === undefined || delegation === undefined ? IDLE_KEY : queryKeys.lowGasPayout(chainId, account, delegation),
    queryFn:
      account === undefined || delegation === undefined || client === undefined ? skipToken : () => readLowGasPayout({ client, account, code: delegation }).then(settledPayout),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return payout.status === "success" && payout.data === "cannot-receive";
}
