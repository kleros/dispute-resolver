import { formatEther } from "viem";
import { currencySymbol, type ChainConfig } from "@dispute-resolver/core";

/**
 * An amount in wei as ether with the chain's currency symbol (D-10), for places that need a string, such as a button
 * label. Every amount uses the chain's symbol, never a hard-coded "ETH".
 */
export function formatAmount(wei: bigint, chain: ChainConfig): string {
  return `${formatEther(wei)} ${currencySymbol(chain)}`;
}
