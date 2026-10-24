import { getChain, readArbitrationCost, type Address, type ChainId, type Hex } from "@dispute-resolver/core";
import { skipToken, useQuery } from "@tanstack/react-query";
import { STALE_TIME_MS } from "./constants";
import { useCoreDeps } from "./context";
import { IDLE_KEY, queryKeys } from "./queryKeys";
import { LOADING, fromOutcome, fromQuery, noRpcError, ready, unavailable, unavailableFrom } from "./sectionData";
import type { SectionData } from "./types";

export function useArbitrationCost(chainId: ChainId, extraData: Hex | undefined): SectionData<bigint> {
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

/** EIP-7702 delegated EOAs carry this code prefix and are not smart-contract wallets. */
const EIP7702_DELEGATION_PREFIX = "0xef0100";

export function isContractCode(code: Hex | undefined): boolean {
  return code !== undefined && code !== "0x" && !code.toLowerCase().startsWith(EIP7702_DELEGATION_PREFIX);
}

/** Without an account, an RPC or a successful read the answer is `false`, so a failed read hides the warning. */
export function useIsContractAccount(chainId: ChainId, account: Address | undefined): SectionData<boolean> {
  const deps = useCoreDeps();
  const client = deps.getReadClient(chainId);
  const query = useQuery({
    queryKey: account === undefined ? IDLE_KEY : queryKeys.accountCode(chainId, account),
    queryFn: account === undefined || client === undefined ? skipToken : () => client.getCode({ address: account }).then(isContractCode),
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (account === undefined || client === undefined) return ready(false);
  if (query.status === "error") return ready(false);
  return query.status === "pending" ? LOADING : ready(query.data);
}
