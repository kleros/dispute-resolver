import { redactingHttp, resolveReadRpcUrl, type ChainConfig, type Env } from "@dispute-resolver/core";
import { custom, type Transport } from "viem";

/** The error every request of an unconfigured chain's transport rejects with; a failed receipt shows its text. */
export function noRpcConfiguredError(chainId: number): Error {
  // data/sectionData.ts words the same case for a section it cannot read; keep the two sentences identical.
  return new Error(`Reads on chain ${String(chainId)} are unavailable.`);
}

/**
 * The configured read RPC, or, when the chain has none, a transport whose every request rejects: there is never a public
 * default. Wagmi signs through the connector; the app reads through core's clients only. Its errors name the RPC by
 * origin: AppKit logs a failed balance read to the console as it is.
 */
export function walletTransport(chain: ChainConfig, env: Env): Transport {
  const resolution = resolveReadRpcUrl(chain, env);
  if (resolution.status === "configured") return redactingHttp(resolution.url);
  return custom({ request: () => Promise.reject(noRpcConfiguredError(chain.id)) }, { retryCount: 0 });
}

export function walletTransports(chains: readonly ChainConfig[], env: Env): Record<number, Transport> {
  return Object.fromEntries(chains.map((chain) => [chain.id, walletTransport(chain, env)]));
}
