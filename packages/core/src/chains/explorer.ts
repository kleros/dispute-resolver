import type { Address, Hex } from "../types";
import type { ChainConfig } from "./types";

/** Link to an address on the chain's explorer (D-40), or `null` when the chain has none. */
export function explorerAddressUrl(chain: ChainConfig, address: Address): string | null {
  return chain.explorerBaseUrl === undefined ? null : `${chain.explorerBaseUrl}/address/${address}`;
}

/** Link to a transaction on the chain's explorer (D-40), or `null` when the chain has none. */
export function explorerTxUrl(chain: ChainConfig, hash: Hex): string | null {
  return chain.explorerBaseUrl === undefined ? null : `${chain.explorerBaseUrl}/tx/${hash}`;
}
