import { toRegistryAddress } from "@dispute-resolver/core";
import { getAccount, type Config, type Connector, type GetAccountReturnType } from "@wagmi/core";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useWalletSetupPendingReconnect } from "./context";
import type { WalletState } from "./types";

/**
 * The part of wagmi's account read here. Wagmi types its connector as a full `Connector`, but while it reconnects the
 * connection it read from storage carries only the `{ id, name, type, uid }` it persisted, with no method.
 */
export interface WagmiAccount {
  readonly status: GetAccountReturnType["status"];
  readonly address: string | undefined;
  readonly chainId: number | undefined;
  readonly connector: (Pick<Connector, "id" | "name" | "type" | "uid"> & Partial<Pick<Connector, "getAccounts" | "getChainId">>) | undefined;
}

/** The test wagmi's `getConnectorClient` makes to tell a stored connection from a restored one. */
function isRestored(connector: WagmiAccount["connector"]): boolean {
  return connector?.getAccounts !== undefined || connector?.getChainId !== undefined;
}

/**
 * Wagmi's account as the app's `WalletState`. A connection is `connected` once wagmi has restored it, even while its
 * reconnect still checks the other installed wallets, which can take many seconds. The connection read from storage is
 * only remembered: it is `connecting` until restored, so routing waits for it. Wagmi also reports `connecting` for its
 * mount-time check of every wallet when nothing is stored and for a connection the user starts in the modal: with
 * nothing restored, neither is a remembered connection, so the wallet stays `disconnected` until it connects.
 */
export function toWalletState(account: WagmiAccount): WalletState {
  const { status, address, chainId, connector } = account;
  if (address !== undefined && chainId !== undefined && (status === "connected" || isRestored(connector))) {
    return { status: "connected", address: toRegistryAddress(address), chainId };
  }
  if (status === "reconnecting") return { status: "connecting" };
  return { status: "disconnected" };
}

/**
 * The wallet as `useWallet` reports it, read from wagmi's current state rather than the last render: what a write or a
 * switch checks before asking the wallet.
 */
export function currentWalletState(config: Config): WalletState {
  return toWalletState(getAccount(config));
}

export function useWallet(): WalletState {
  const pendingReconnect = useWalletSetupPendingReconnect();
  const { status, address, chainId, connector } = useAccount();
  return useMemo<WalletState>(
    () => (pendingReconnect ? { status: "connecting" } : toWalletState({ status, address, chainId, connector })),
    [pendingReconnect, status, address, chainId, connector],
  );
}

export function useWalletChainId(): number | undefined {
  const wallet = useWallet();
  return wallet.status === "connected" ? wallet.chainId : undefined;
}
