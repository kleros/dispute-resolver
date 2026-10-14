import { getChain } from "../chains";
import type { LookupReadClients } from "../reality/types";
import { createReadClient } from "../rpc";
import type { ChainId, Env, ReadClient } from "../types";

/**
 * The Reality lookup's clients (`reality.LookupReadClients`): for each lookup, one client per chain over the chain's read
 * RPC (A13), built by `rpc.createReadClient` with the lookup's request budget and transport options. Every attempt the
 * transport sends, retries included, spends the budget first, so the lookup's request count, its deadline and an abort
 * bound what is actually sent, and a lookup's `retryCount` override applies (spec 9.1, A5). A chain that is not in the
 * chain table (D-18) or has no read RPC (D-56) has no client.
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
