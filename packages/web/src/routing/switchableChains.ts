import { getChain, type ChainConfig } from "@dispute-resolver/core";

/**
 * Only the production chains with a court are offered, by the header pill and the unsupported-network screen alike; a
 * testnet page is reached by URL alone. An explicit list, because the testnet flag alone would keep the courtless mainnets.
 */
const SWITCHABLE_CHAIN_IDS: readonly number[] = [1, 100];

export const SWITCHABLE_CHAINS: readonly ChainConfig[] = SWITCHABLE_CHAIN_IDS.map((id) => getChain(id)).filter((chain): chain is ChainConfig => chain !== undefined);
