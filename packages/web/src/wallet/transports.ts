import { resolveReadRpcUrl, type ChainConfig, type Env } from "@dispute-resolver/core";
import { custom, http, type Transport } from "viem";

/** The error every request of an unconfigured chain's transport rejects with (D-56); a failed receipt shows its text. */
export function noRpcConfiguredError(chainId: number): Error {
  // data/sectionData.ts words the same case for a section it cannot read; keep the two sentences identical.
  return new Error(`Reads on chain ${String(chainId)} are unavailable.`);
}

/**
 * The wagmi transport of one chain (ARCHITECTURE.md §2.3): the configured read RPC, or, when the chain has none, a
 * transport whose every request rejects. There is never a public default (D-56). Wagmi signs through the connector; the
 * app reads through core's clients only (A13, §6.4).
 */
export function walletTransport(chain: ChainConfig, env: Env): Transport {
  const resolution = resolveReadRpcUrl(chain, env);
  if (resolution.status === "configured") return http(resolution.url);
  return custom({ request: () => Promise.reject(noRpcConfiguredError(chain.id)) }, { retryCount: 0 });
}

/** One transport per configured chain, keyed by chain ID. */
export function walletTransports(chains: readonly ChainConfig[], env: Env): Record<number, Transport> {
  return Object.fromEntries(chains.map((chain) => [chain.id, walletTransport(chain, env)]));
}
