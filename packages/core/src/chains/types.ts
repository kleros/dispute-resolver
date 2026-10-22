import type { Address, ChainId } from "../types";

export interface ChainConfig {
  readonly id: ChainId;
  readonly name: string;
  readonly currency: string;
  readonly isTestnet: boolean;
  readonly klerosLiquid?: Address;
  readonly arbitrableProxy?: Address;
  readonly policyRegistry?: Address;
  /** The first block any arbitrator event can be in. */
  readonly arbitratorDeployedAtBlock?: number;
  readonly maxLookback: number;
  readonly readRpcEnv?: string;
  /** Literal read RPC URL used when `readRpcEnv` is absent or unset. */
  readonly defaultRpcUrl?: string;
  /** Env variable holding the RPC URL given to third-party frames and scripts. */
  readonly publicRpcEnv?: string;
  /** Explorer origin without a trailing slash. */
  readonly explorerBaseUrl?: string;
}

export type ChainTable = Readonly<Record<ChainId, ChainConfig>>;

/** An unset variable means "no RPC configured", never a fallback to another source. */
export type RpcUrlResolution = { readonly status: "configured"; readonly url: string } | { readonly status: "unconfigured"; readonly chainId: ChainId };

export interface ChainCapabilities {
  readonly hasArbitrator: boolean;
  readonly canCreate: boolean;
}
