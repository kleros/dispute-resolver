import { toRegistryAddress } from "@dispute-resolver/core";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useWalletSetupPendingReconnect } from "./context";
import type { WalletState } from "./types";

type AccountStatus = ReturnType<typeof useAccount>["status"];

/**
 * Wagmi's account as the app's `WalletState`. Only restoring a remembered connection is `connecting`, so routing waits
 * for it to settle. Wagmi reports `connecting` both for its mount-time probe of every connector when nothing is stored
 * (slow with browser extensions) and for a connection the user starts in the modal: neither is a remembered connection,
 * so the wallet stays `disconnected` until it connects.
 */
export function toWalletState(status: AccountStatus, address: string | undefined, chainId: number | undefined): WalletState {
  if (status === "connected" && address !== undefined && chainId !== undefined) {
    return { status: "connected", address: toRegistryAddress(address), chainId };
  }
  if (status === "reconnecting") return { status: "connecting" };
  return { status: "disconnected" };
}

/**
 * The connected wallet, if any. Its chain follows the wallet's `chainChanged` events without a reload. While
 * AppKit loads, a wallet whose connection wagmi stored is `connecting`: it reconnects only once AppKit's config exists,
 * and routing waits for that as it waits for wagmi's reconnect. Without a stored connection the wallet is
 * `disconnected` from the first render, so routing never waits for AppKit.
 */
export function useWallet(): WalletState {
  const pendingReconnect = useWalletSetupPendingReconnect();
  const { status, address, chainId } = useAccount();
  return useMemo(() => toWalletState(pendingReconnect ? "reconnecting" : status, address, chainId), [pendingReconnect, status, address, chainId]);
}

/** The connected wallet's chain; `undefined` without a settled connection. */
export function useWalletChainId(): number | undefined {
  const wallet = useWallet();
  return wallet.status === "connected" ? wallet.chainId : undefined;
}
