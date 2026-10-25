import type { LookupReadClients } from "../reality/types";
import { createReadClients } from "../rpc";
import type { Env } from "../types";

/**
 * One client per chain per lookup, over the chain's read RPC and carrying the lookup's request budget. Every attempt the
 * transport sends, retries included, spends the budget first, so the lookup's request count, its deadline and an abort
 * bound what is actually sent. A chain that is not in the chain table or has no read RPC has no client.
 */
export function lookupClientsOf(env: Env): LookupReadClients {
  return (budget, options) => createReadClients(env, { ...options, budget });
}
