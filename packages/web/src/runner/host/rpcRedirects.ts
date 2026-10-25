import { publicRpcUrl, type ChainId, type Env } from "@dispute-resolver/core";
import type { RpcRedirectRule } from "../types";
import { isHttpsUrl } from "./httpsUrl";

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
 * Any `https://<network>.infura.io/v3/<key>` goes to that chain's public RPC, so a pinned script that hardcodes Infura
 * with a dead key still reads the chain. A chain whose public RPC is unconfigured, or not https (which the https runner
 * could not reach), gets no rule. Other hosts are never rewritten.
 */
export function buildRpcRedirects(env: Env): readonly RpcRedirectRule[] {
  return INFURA_NETWORKS.flatMap(([network, chainId]): RpcRedirectRule[] => {
    const url = publicRpcUrl(chainId, env);
    if (url === null || !isHttpsUrl(url)) return [];
    return [{ chainId, host: `${network}.infura.io`, pathPrefix: INFURA_PATH_PREFIX, target: url }];
  });
}
