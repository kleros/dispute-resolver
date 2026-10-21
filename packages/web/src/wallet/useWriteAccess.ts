import { checkChainMatch, type ChainId } from "@dispute-resolver/core";
import { useMemo } from "react";
import { useWallet } from "./useWallet";

/** The refusal of a write without a connected wallet, as `WriteStatusNotice` renders it. */
export interface NeedsWalletGuard {
  readonly phase: "needs-wallet";
  readonly pageChainId: ChainId;
}

/** The refusal of a write from a wallet on another chain than the page's, as `WriteStatusNotice` renders it. */
export interface WrongChainGuard {
  readonly phase: "wrong-chain";
  readonly walletChainId: number;
  readonly pageChainId: ChainId;
}

/** Whether a write on the page chain can be signed now, and the refusal to show when it cannot. */
export type WriteAccess =
  { readonly status: "ready" } | { readonly status: "needs-wallet"; readonly guard: NeedsWalletGuard } | { readonly status: "wrong-chain"; readonly guard: WrongChainGuard };

/**
 * The chain guard every write surface reads before it offers its action: a wallet still connecting counts as no wallet,
 * since nothing can be signed until it settles. The page chain is a parameter because `wallet` does not depend on routing.
 */
export function useWriteAccess(pageChainId: ChainId): WriteAccess {
  const wallet = useWallet();
  const walletChainId = wallet.status === "connected" ? wallet.chainId : undefined;
  return useMemo<WriteAccess>(() => {
    const match = checkChainMatch(walletChainId, pageChainId);
    if (match.ok) return { status: "ready" };
    if (match.reason === "no-wallet") return { status: "needs-wallet", guard: { phase: "needs-wallet", pageChainId } };
    return { status: "wrong-chain", guard: { phase: "wrong-chain", walletChainId: match.walletChainId, pageChainId: match.pageChainId } };
  }, [walletChainId, pageChainId]);
}
