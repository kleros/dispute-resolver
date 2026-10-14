import type { ChainId } from "@dispute-resolver/core";
import { useCallback, useEffect, useState } from "react";
import { useWalletSetup } from "./context";
import type { WalletModal } from "./types";

/** Why no wallet can connect: no WalletConnect project ID (K-02), or AppKit registered an embedded wallet (K-03). */
export type ConnectUnavailableReason = "unconfigured" | "misconfigured";

/** What the Connect controls say instead of offering Connect. */
export const CONNECT_UNAVAILABLE_MESSAGES: Readonly<Record<ConnectUnavailableReason, string>> = {
  unconfigured: "Wallet connection is not configured on this deployment.",
  misconfigured: "Wallet connection is misconfigured on this deployment.",
};

export interface ConnectWallet {
  /** `false` when no wallet can connect; `unavailableReason` says why. */
  readonly available: boolean;
  /** `null` while Connect is available. */
  readonly unavailableReason: ConnectUnavailableReason | null;
  /**
   * Opens AppKit's Connect view on `chainId` (the page chain), so a WalletConnect session starts there (ARCHITECTURE.md
   * §2.3). Closing the modal or rejecting the wallet's prompt leaves the app read-only, with no error (D-06).
   */
  readonly open: (chainId?: ChainId) => void;
}

/** What each modal's check found, so a control mounted later renders the answer at once instead of after a tick. */
const embeddedWalletChecks = new WeakMap<WalletModal, boolean>();

/** `true` once AppKit is ready with an embedded-wallet connector registered (K-03); `false` before that is known. */
function useEmbeddedWallet(modal: WalletModal | null): boolean {
  const [embedded, setEmbedded] = useState(() => modal !== null && embeddedWalletChecks.get(modal) === true);
  useEffect(() => {
    if (modal === null) return undefined;
    let active = true;
    modal.hasEmbeddedWallet().then(
      (found) => {
        embeddedWalletChecks.set(modal, found);
        if (active) setEmbedded(found);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [modal]);
  return modal !== null && embedded;
}

export function useConnectWallet(): ConnectWallet {
  const setup = useWalletSetup();
  const modal = setup.mode === "appkit" ? setup.modal : null;
  const misconfigured = useEmbeddedWallet(modal);
  const open = useCallback(
    (chainId?: ChainId) => {
      // A modal that fails or refuses to open leaves the app read-only, which is the outcome of declining (D-06, K-03).
      modal?.openConnect(chainId).catch(() => undefined);
    },
    [modal],
  );
  let unavailableReason: ConnectUnavailableReason | null = null;
  if (modal === null) unavailableReason = "unconfigured";
  else if (misconfigured) unavailableReason = "misconfigured";
  return { available: unavailableReason === null, unavailableReason, open };
}
