import { getChain, toRegistryAddress } from "@dispute-resolver/core";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useWalletSetup, useWalletSetupPendingReconnect } from "./context";
import type { WalletMode, WalletState } from "./types";

type AccountStatus = ReturnType<typeof useAccount>["status"];

/**
 * Wagmi's account as the app's `WalletState`. Only a settled connection is `connected`: while wagmi reconnects a
 * returning wallet the state is `connecting`, so routing can wait for the reconnect to settle.
 */
export function toWalletState(mode: WalletMode, status: AccountStatus, address: string | undefined, chainId: number | undefined): WalletState {
  if (status === "connected" && address !== undefined && chainId !== undefined) {
    return { status: "connected", mode, address: toRegistryAddress(address), chainId, isConfiguredChain: getChain(chainId) !== undefined };
  }
  if (status === "connecting" || status === "reconnecting") return { status: "connecting", mode };
  return { status: "disconnected", mode };
}

/**
 * The connected wallet, if any. Its chain follows the wallet's `chainChanged` events without a reload. While
 * AppKit loads, a wallet whose connection wagmi stored is `connecting`: it reconnects only once AppKit's config exists,
 * and routing waits for that as it waits for wagmi's reconnect. Without a stored connection the wallet is
 * `disconnected` from the first render, so routing never waits for AppKit.
 */
export function useWallet(): WalletState {
  const { mode } = useWalletSetup();
  const pendingReconnect = useWalletSetupPendingReconnect();
  const { status, address, chainId } = useAccount();
  return useMemo(() => toWalletState(mode, pendingReconnect ? "connecting" : status, address, chainId), [mode, pendingReconnect, status, address, chainId]);
}
