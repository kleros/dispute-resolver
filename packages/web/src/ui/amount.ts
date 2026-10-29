import { formatEther } from "viem";
import type { ChainConfig } from "@dispute-resolver/core";

export function formatAmount(wei: bigint, chain: ChainConfig): string {
  return `${formatEther(wei)} ${chain.currency}`;
}
