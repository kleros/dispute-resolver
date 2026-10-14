import { getChain } from "../../../packages/core/src/chains";
import type { ChainConfig } from "../../../packages/core/src/chains/types";
import { createReadClient } from "../../../packages/core/src/rpc";
import type { Address, ChainId, Env, ReadClient } from "../../../packages/core/src/types";
import { createPinnedClient } from "./pinnedClient";

/** The chains with an arbitrator (04 §3 step 1). */
export const ARBITRATOR_CHAINS: readonly ChainId[] = [1, 100, 11155111, 10200];

/** One chain read as of one recorded block. */
export interface ChainReader {
  readonly chainId: ChainId;
  readonly chain: ChainConfig;
  readonly arbitrator: Address;
  /** The head when the reader was opened; every read through `client` answers as of it. */
  readonly block: bigint;
  readonly client: ReadClient;
}

/**
 * Opens a reader of `chainId` through its configured read RPC (core's `CHAINS` and `createReadClient`, A13), pinned at
 * the current head. Rejects with a message naming the chain and its variable, never its value, when no RPC is set.
 */
export async function openChainReader(chainId: ChainId, env: Env): Promise<ChainReader> {
  const chain = getChain(chainId);
  const arbitrator = chain?.klerosLiquid;
  if (chain === undefined || arbitrator === undefined) throw new Error(`Chain ${String(chainId)} has no arbitrator in core's chain table.`);
  const resolution = createReadClient(chain, env);
  if (resolution.status !== "ok") throw new Error(`Chain ${String(chainId)} has no read RPC: set ${chain.readRpcEnv ?? "its read RPC variable"} in .env.`);
  const block = await resolution.client.getBlockNumber();
  return { chainId, chain, arbitrator, block, client: createPinnedClient(resolution.client, block) };
}
