import { getChain, resolvePublicRpcUrl, type ChainId, type Env } from "@dispute-resolver/core";
import type { RpcRedirectRule } from "../types";
import { isHttpsUrl } from "./httpsUrl";

/** Infura's network name for each configured chain it serves (ARCHITECTURE.md §7.3). */
const INFURA_NETWORKS: readonly (readonly [network: string, chainId: ChainId])[] = [
  ["mainnet", 1],
  ["sepolia", 11155111],
  ["polygon-mainnet", 137],
  ["arbitrum-mainnet", 42161],
  ["arbitrum-sepolia", 421614],
  ["optimism-sepolia", 11155420],
  ["base-mainnet", 8453],
  ["base-sepolia", 84532],
  ["unichain-mainnet", 130],
  ["unichain-sepolia", 1301],
  ["zksync-mainnet", 324],
  ["zksync-sepolia", 300],
];

const INFURA_PATH_PREFIX = "/v3/";

/**
 * The runner's RPC redirect rules (D-25): any `https://<network>.infura.io/v3/<key>` goes to that chain's public RPC
 * (D-35), so a pinned script that hardcodes Infura with a dead key still reads the chain. A chain whose public RPC is
 * unconfigured, or not https (which the https runner could not reach), gets no rule. Other hosts are never rewritten.
 */
export function buildRpcRedirects(env: Env): readonly RpcRedirectRule[] {
  return INFURA_NETWORKS.flatMap(([network, chainId]): RpcRedirectRule[] => {
    const chain = getChain(chainId);
    if (chain === undefined) return [];
    const resolution = resolvePublicRpcUrl(chain, env);
    if (resolution.status !== "configured" || !isHttpsUrl(resolution.url)) return [];
    return [{ chainId, host: `${network}.infura.io`, pathPrefix: INFURA_PATH_PREFIX, target: resolution.url }];
  });
}
