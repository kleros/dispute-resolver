import type { Address, ChainId } from "../types";

/**
 * One supported chain (spec §7 minus the D-23 drops), 06 §2. The table holds 15 chains: 1, 100, 10200, 11155111 with
 * an arbitrator, and 130, 1301, 137, 300, 324, 690, 42161, 421614, 11155420, 8453, 84532 without one.
 */
export interface ChainConfig {
  readonly id: ChainId;
  readonly name: string;
  /** Currency symbol shown next to every amount on this chain (D-10): "ETH", "xDai", "sETH", "MATIC". */
  readonly currency: string;
  readonly isTestnet: boolean;
  readonly klerosLiquid?: Address;
  readonly arbitrableProxy?: Address;
  readonly policyRegistry?: Address;
  /** Today's `QUERY_FROM_BLOCK`; the first block any arbitrator event can be in (§6.3). */
  readonly arbitratorDeployedAtBlock?: number;
  /** Today's `MAX_LOOKBACK`: 1,000,000 blocks, or 50,000 on the testnets of §6.3. */
  readonly maxLookback: number;
  /** Name of the env variable holding the read RPC URL, e.g. "REACT_APP_WEB3_PROVIDER_URL". */
  readonly readRpcEnv?: string;
  /** Literal read RPC URL when `readRpcEnv` is absent or unset; only zkSync Era (324) and zkSync Sepolia (300). */
  readonly defaultRpcUrl?: string;
  /** Name of the env variable holding the RPC URL given to third-party frames, e.g. "REACT_APP_PUBLIC_RPC_1" (D-35). */
  readonly publicRpcEnv?: string;
  /** Explorer origin without a trailing slash, e.g. "https://etherscan.io" (D-40). */
  readonly explorerBaseUrl?: string;
}

/** The chain table, keyed by chain ID. */
export type ChainTable = Readonly<Record<ChainId, ChainConfig>>;

/** Result of resolving an RPC URL from the env (D-56: an unset variable means "no RPC configured", never a fallback). */
export type RpcUrlResolution = { readonly status: "configured"; readonly url: string } | { readonly status: "unconfigured"; readonly chainId: ChainId };

/** What a chain supports, derived from its config (§7 "What each kind of chain can do"). */
export interface ChainCapabilities {
  readonly hasArbitrator: boolean;
  readonly canCreate: boolean;
}
