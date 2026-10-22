import type { ChainId } from "@dispute-resolver/core";
import { useCallback, useEffect, useState } from "react";
import { useWalletSetup } from "./context";
import type { WalletModal } from "./types";

/** `unconfigured`: no WalletConnect project ID; `misconfigured`: AppKit registered an embedded wallet. */
export type ConnectUnavailableReason = "unconfigured" | "misconfigured";

export interface ConnectWallet {
  readonly available: boolean;
  readonly unavailableReason: ConnectUnavailableReason | null;
  /**
   * Opens AppKit's Connect view on `chainId` (the page chain), so a WalletConnect session starts there. Closing the
   * modal or rejecting the wallet's prompt leaves the app read-only, with no error.
   */
  readonly open: (chainId?: ChainId) => void;
}

/** What each modal's check found, so a control mounted later renders the answer at once instead of after a tick. */
const embeddedWalletChecks = new WeakMap<WalletModal, boolean>();

/** `true` once AppKit is ready with an embedded-wallet connector registered; `false` before that is known. */
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
      // A modal that fails or refuses to open leaves the app read-only, which is the outcome of declining.
      modal?.openConnect(chainId).catch(() => undefined);
    },
    [modal],
  );
  let unavailableReason: ConnectUnavailableReason | null = null;
  if (modal === null) unavailableReason = "unconfigured";
  else if (misconfigured) unavailableReason = "misconfigured";
  return { available: unavailableReason === null, unavailableReason, open };
}
