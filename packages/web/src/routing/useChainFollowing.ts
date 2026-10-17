import { parseChainId } from "@dispute-resolver/core";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useNetworkSwitch, useWallet } from "../wallet";
import { CHAIN_PARAM } from "./pageChain";
import { isChainNumber, replaceChainSegment } from "./paths";

/**
 * Keeps the page and the wallet on one chain without a reload (D-55, ARCHITECTURE.md §3.6). Runs once, in the
 * `/:chainId` layout route.
 *
 * - When the connected wallet changes chain, the app moves to that chain: the URL's chain segment is replaced (spec
 *   §1.3) with `replace`, keeping the rest of the path and the search. An unconfigured chain shows the
 *   unsupported-network screen.
 * - When a wallet becomes connected (wagmi's reconnect settling at load, or the user's first connect) on a chain other
 *   than a configured page chain, the wallet is asked once to switch to the page chain. Declining leaves reads on the
 *   URL's chain; writes refuse until the chains match (D-48).
 * - A reconnect of the same wallet is not a new connection: while wagmi reconnects (`connecting`; with an injected
 *   wallet the built app reconnects twice at load) the last chain is kept, so the wallet is not asked again. Only a
 *   disconnect ends the connection.
 * - A wallet chain ID that is not a positive integer (0, or NaN from a malformed `chainChanged` value) names no chain:
 *   it is ignored, so the page stays where it is and the next valid chain is compared with the last valid one.
 */
export function useChainFollowing(): void {
  const wallet = useWallet();
  const reconnecting = wallet.status === "connecting";
  const walletChainId = wallet.status === "connected" ? wallet.chainId : undefined;
  const pageChainId = parseChainId(useParams()[CHAIN_PARAM]);
  const location = useLocation();
  const navigate = useNavigate();
  const { switchTo } = useNetworkSwitch();
  /** The chain of the current connection as last seen; `undefined` while no wallet is connected. */
  const followed = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reconnecting || (walletChainId !== undefined && !isChainNumber(walletChainId))) return;
    const previous = followed.current;
    followed.current = walletChainId;
    if (walletChainId === undefined || previous === walletChainId) return;
    if (previous === undefined) {
      // A new connection: the undefined → chain transition is not a change, so nothing navigates.
      if (pageChainId !== undefined && pageChainId !== walletChainId) void switchTo(pageChainId);
      return;
    }
    // A switch the app requested lands on the page chain; there is nothing to follow.
    if (walletChainId === pageChainId) return;
    const target = { pathname: replaceChainSegment(location.pathname, walletChainId), search: location.search, hash: location.hash };
    // A declarative router navigates synchronously; the Promise in navigate's return type belongs to data routers.
    void Promise.resolve(navigate(target, { replace: true }));
  }, [reconnecting, walletChainId, pageChainId, location, navigate, switchTo]);
}
