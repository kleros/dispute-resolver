import { redactingHttp, resolveReadRpcUrl, type ChainConfig, type Env } from "@dispute-resolver/core";
import { custom, type Transport } from "viem";
import { noRpcError } from "../data";

/**
 * The configured read RPC, or, when the chain has none, a transport whose every request rejects: there is never a public
 * default. Wagmi signs through the connector; the app reads through core's clients only. Its errors name the RPC by
 * origin: AppKit logs a failed balance read to the console as it is.
 */
export function walletTransport(chain: ChainConfig, env: Env): Transport {
  const resolution = resolveReadRpcUrl(chain, env);
  if (resolution.status === "configured") return redactingHttp(resolution.url);
  // A failed receipt shows this text, so it is the sentence a section without a read RPC shows.
  return custom({ request: () => Promise.reject(new Error(noRpcError(chain.id).message)) }, { retryCount: 0 });
}

export function walletTransports(chains: readonly ChainConfig[], env: Env): Record<number, Transport> {
  return Object.fromEntries(chains.map((chain) => [chain.id, walletTransport(chain, env)]));
}
