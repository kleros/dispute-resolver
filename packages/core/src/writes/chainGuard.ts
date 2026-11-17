import type { ChainMatch } from "./types";

/** Runs before every signature. `wrong-chain` carries both chains so the refusal can offer the switch again. */
export function checkChainMatch(walletChainId: number | undefined, pageChainId: number): ChainMatch {
  if (walletChainId === undefined) return { ok: false, reason: "no-wallet" };
  if (walletChainId !== pageChainId) return { ok: false, reason: "wrong-chain", walletChainId, pageChainId };
  return { ok: true, chainId: pageChainId };
}
