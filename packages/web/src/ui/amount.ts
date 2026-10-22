import { formatEther } from "viem";
import { currencySymbol, type ChainConfig } from "@dispute-resolver/core";

/** The string form of `Amount`, for places such as a button label. */
export function formatAmount(wei: bigint, chain: ChainConfig): string {
  return `${formatEther(wei)} ${currencySymbol(chain)}`;
}
