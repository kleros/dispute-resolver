import { useMemo } from "react";
import { chainGuard } from "./performWrite";
import type { NeedsWalletGuard, WrongChainGuard } from "./types";
import { useWalletChainId } from "./useWallet";

/** Whether a write on the page chain can be signed now, and the refusal to show when it cannot. */
export type WriteAccess =
  { readonly status: "ready" } | { readonly status: "needs-wallet"; readonly guard: NeedsWalletGuard } | { readonly status: "wrong-chain"; readonly guard: WrongChainGuard };

/**
 * The chain guard every write surface reads before it offers its action: a wallet still connecting counts as no wallet,
 * since nothing can be signed until it settles. The page chain is a parameter because `wallet` does not depend on routing.
 */
export function useWriteAccess(pageChainId: number): WriteAccess {
  const walletChainId = useWalletChainId();
  return useMemo<WriteAccess>(() => {
    const guard = chainGuard(walletChainId, pageChainId);
    if (guard === null) return { status: "ready" };
    return guard.phase === "needs-wallet" ? { status: "needs-wallet", guard } : { status: "wrong-chain", guard };
  }, [walletChainId, pageChainId]);
}
