import { parseChainId } from "@dispute-resolver/core";
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams, type Location } from "react-router";
import { useNetworkSwitch, useWallet, type NetworkSwitch } from "../wallet";
import { useChainNotice } from "./chainNotices";
import { CHAIN_PARAM, isChainNumber, pathDisputeId, walletChainLocation } from "./paths";

type SwitchOutcome = Awaited<ReturnType<NetworkSwitch["switchTo"]>>;

type SwitchFailure = Extract<SwitchOutcome, { readonly ok: false }>;

/** What the layout last rendered, read when a switch request settles. */
interface Latest {
  readonly connecting: boolean;
  readonly walletChainId: number | undefined;
  readonly pageChainId: number | undefined;
  readonly location: Location;
}

/** A refusal or failure that settled while wagmi reconnected, with the key of the ask it answers. */
interface HeldFailure {
  readonly key: string;
  readonly result: SwitchFailure;
}

/**
 * Runs once, in the `/:chainId` layout route. With a wallet connected, the wallet's chain is the truth:
 *
 * - When the wallet becomes connected on another chain than the page's, or the URL moves to another chain while it is
 *   connected, the wallet is asked once to switch to the page chain. If it switches the page stays; if it refuses or the
 *   switch fails the app moves to the wallet's chain (a case page to that chain's Ongoing Disputes, since the same number
 *   there is another dispute) and routing reports a notice, which shell shows as a toast.
 * - When the wallet changes chain by itself the app follows it without a reload, a case page to that chain's Ongoing.
 * - Nothing is asked while any switch request waits in the wallet; once another control's request settles and the
 *   mismatch remains, the wallet is asked then. The move after a refusal always lands where the page chain is the
 *   wallet's or on an unconfigured chain, where nothing is asked, so the asks never loop.
 * - A reconnect of the same wallet is not a new connection: while wagmi reconnects (with an injected wallet the built app
 *   reconnects twice at load) the last chain is kept, so the wallet is not asked again. A refusal that settles meanwhile
 *   is applied once the wallet is back, if it is still the answer to the same ask.
 * - The router renders a navigation in a transition, so a render for another update (a switch request settling) can
 *   still show the page this hook just moved away from: nothing is asked until the router shows the move.
 * - A wallet chain ID that is not a positive integer (0, or NaN from a malformed `chainChanged` value) is ignored, so the
 *   next valid chain is compared with the last valid one.
 *
 * While a request waits the page shows its own chain with the wallet elsewhere; every write path refuses then.
 */
export function useChainFollowing(): void {
  const wallet = useWallet();
  const connecting = wallet.status === "connecting";
  const walletChainId = wallet.status === "connected" ? wallet.chainId : undefined;
  const pageChainId = parseChainId(useParams()[CHAIN_PARAM]);
  const location = useLocation();
  const navigate = useNavigate();
  const { state: switchState, switchTo } = useNetworkSwitch();
  const anyPending = switchState.status === "switching";
  const notify = useChainNotice();

  /** The chain of the current connection as last seen; `undefined` while no wallet is connected. */
  const followed = useRef<number | undefined>(undefined);
  /** Counts connections, so a new one is asked again where the previous one was. */
  const generation = useRef(0);
  /**
   * The last ask, by connection, wallet chain, page chain and history entry; written before the request is sent, so
   * neither a re-render nor StrictMode's second effect asks twice.
   */
  const asked = useRef<string | null>(null);
  /** This layout's own request is waiting in the wallet. */
  const own = useRef(false);
  const held = useRef<HeldFailure | null>(null);
  /** The key of the history entry this hook last moved away from, until the router renders another. */
  const movedFrom = useRef<string | null>(null);
  const mounted = useRef(false);
  const latest = useRef<Latest>({ connecting, walletChainId, pageChainId, location });

  useEffect(() => {
    latest.current = { connecting, walletChainId, pageChainId, location };
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const moveToWalletChain = useCallback(
    (from: Location, chainId: number) => {
      movedFrom.current = from.key;
      // A declarative router navigates synchronously; the Promise in navigate's return type belongs to data routers.
      void Promise.resolve(navigate(walletChainLocation(from, chainId), { replace: true }));
    },
    [navigate],
  );

  const fallBack = useCallback(
    (from: Location, walletChain: number, pageChain: number, result: SwitchFailure) => {
      moveToWalletChain(from, walletChain);
      notify({
        outcome: result.reason === "rejected" ? "declined" : "failed",
        walletChainId: walletChain,
        pageChainId: pageChain,
        disputeId: pathDisputeId(from.pathname),
        reason: result.message,
      });
    },
    [moveToWalletChain, notify],
  );

  const settle = useCallback(
    (key: string, result: SwitchOutcome) => {
      own.current = false;
      if (result.ok) return;
      if (result.reason === "pending") {
        // Nothing was sent: the ask is made again once the other request settles.
        if (asked.current === key) asked.current = null;
        return;
      }
      const now = latest.current;
      if (!mounted.current) return;
      if (now.walletChainId === undefined) {
        // The asked key outlives the reconnect, so a refusal dropped here would never be asked or applied again.
        if (now.connecting) held.current = { key, result };
        return;
      }
      if (now.pageChainId === undefined || now.pageChainId === now.walletChainId) return;
      fallBack(now.location, now.walletChainId, now.pageChainId, result);
    },
    [fallBack],
  );

  useEffect(() => {
    if (connecting || (walletChainId !== undefined && !isChainNumber(walletChainId))) return;
    const previous = followed.current;
    followed.current = walletChainId;
    const failure = held.current;
    held.current = null;
    if (walletChainId === undefined) return;
    if (previous === undefined) generation.current += 1;
    if (movedFrom.current !== location.key) movedFrom.current = null;
    if (previous !== undefined && previous !== walletChainId && walletChainId !== pageChainId) {
      moveToWalletChain(location, walletChainId);
      return;
    }
    if (pageChainId === undefined || walletChainId === pageChainId) return;
    const key = `${String(generation.current)}:${String(walletChainId)}:${String(pageChainId)}:${location.key}`;
    if (failure?.key === key) {
      fallBack(location, walletChainId, pageChainId, failure.result);
      return;
    }
    if (own.current || anyPending || movedFrom.current !== null || asked.current === key) return;
    asked.current = key;
    own.current = true;
    void switchTo(pageChainId).then((result) => {
      settle(key, result);
    });
  }, [connecting, walletChainId, pageChainId, location, anyPending, moveToWalletChain, fallBack, switchTo, settle]);
}
