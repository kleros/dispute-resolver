import { checkChainMatch } from "@dispute-resolver/core";
import { useMemo } from "react";
import { usePageChain } from "../../routing";
import { useWallet, type WriteStatus } from "../../wallet";

/** A refusal of the chain guard, as the write status `WriteStatusNotice` renders with its Connect and Switch offers. */
export type GuardStatus = Extract<WriteStatus, { readonly phase: "needs-wallet" | "wrong-chain" }>;

/**
 * The chain guard every signature on this page passes first (B3, D-48): `null` when the wallet is connected on the page
 * chain, otherwise why not. It covers the Atlas sign-in of the primary document as well as the Create action.
 */
export function useChainGuard(): GuardStatus | null {
  const { chainId } = usePageChain();
  const wallet = useWallet();
  const walletChainId = wallet.status === "connected" ? wallet.chainId : undefined;
  return useMemo(() => {
    const match = checkChainMatch(walletChainId, chainId);
    if (match.ok) return null;
    return match.reason === "no-wallet" ? { phase: "needs-wallet", pageChainId: chainId } : { phase: "wrong-chain", walletChainId: match.walletChainId, pageChainId: match.pageChainId };
  }, [walletChainId, chainId]);
}
