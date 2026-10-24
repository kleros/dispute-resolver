import type { Address, Hex } from "../types";
import type { ChainConfig } from "./types";

export function explorerAddressUrl(chain: ChainConfig, address: Address): string | null {
  return chain.explorerBaseUrl === undefined ? null : `${chain.explorerBaseUrl}/address/${address}`;
}

export function explorerTxUrl(chain: ChainConfig, hash: Hex): string | null {
  return chain.explorerBaseUrl === undefined ? null : `${chain.explorerBaseUrl}/tx/${hash}`;
}
