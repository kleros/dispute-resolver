import type { Address, Hex } from "../types";
import type { ChainConfig } from "./types";

export function explorerAddressUrl(chain: ChainConfig, address: Address): string {
  return `${chain.explorerBaseUrl}/address/${address}`;
}

export function explorerTxUrl(chain: ChainConfig, hash: Hex): string {
  return `${chain.explorerBaseUrl}/tx/${hash}`;
}
