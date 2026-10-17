import type { ChainId } from "../types";
import type { ChainMatch } from "./types";

/**
 * The guard `web` runs before every signature (B3, D-48): `no-wallet` when the wallet's chain is unknown, `wrong-chain`
 * when it differs from the page's chain, so the refusal can offer the switch again.
 */
export function checkChainMatch(walletChainId: number | undefined, pageChainId: ChainId): ChainMatch {
  if (walletChainId === undefined) return { ok: false, reason: "no-wallet" };
  if (walletChainId !== pageChainId) return { ok: false, reason: "wrong-chain", walletChainId, pageChainId };
  return { ok: true, chainId: pageChainId };
}
