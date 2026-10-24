import { getChain } from "../chains";
import type { LookupReadClients } from "../reality/types";
import { createReadClient } from "../rpc";
import type { ChainId, Env, ReadClient } from "../types";

/**
 * One client per chain per lookup, over the chain's read RPC and carrying the lookup's request budget. Every attempt the
 * transport sends, retries included, spends the budget first, so the lookup's request count, its deadline and an abort
 * bound what is actually sent. A chain that is not in the chain table or has no read RPC has no client.
 */
export function lookupClientsOf(env: Env): LookupReadClients {
  return (budget, options) => {
    const built = new Map<ChainId, ReadClient | undefined>();
    return (chainId) => {
      if (!built.has(chainId)) {
        const chain = getChain(chainId);
        const resolution = chain === undefined ? undefined : createReadClient(chain, env, { ...options, budget });
        built.set(chainId, resolution?.status === "ok" ? resolution.client : undefined);
      }
      return built.get(chainId);
    };
  };
}
