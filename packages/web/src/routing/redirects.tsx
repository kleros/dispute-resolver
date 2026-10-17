import { DEFAULT_CHAIN_ID, parseChainId, parseDisputeId, type ChainId } from "@dispute-resolver/core";
import { useContext } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { useWallet } from "../wallet";
import { DisputeNotFoundScreen } from "./DisputeNotFoundScreen";
import { PageChainContext } from "./pageChain";
import { paths, replaceChainSegment } from "./paths";

/**
 * The chain a chain-less URL goes to (ARCHITECTURE.md §3.1): the connected wallet's chain when it is configured,
 * otherwise the default chain. `null` while wagmi is still reconnecting a returning wallet, so that user lands on their
 * wallet's chain instead of being moved there afterwards.
 */
function useDefaultChain(): ChainId | null {
  const wallet = useWallet();
  if (wallet.status === "connecting") return null;
  if (wallet.status === "connected") return parseChainId(wallet.chainId) ?? DEFAULT_CHAIN_ID;
  return DEFAULT_CHAIN_ID;
}

/**
 * `/`, `/:chainId` and `/:chainId/disputes` (D-01): the Ongoing page of the page chain, or, outside a chain, of the
 * default chain once the wallet has settled.
 */
export function RedirectToOngoing() {
  const page = useContext(PageChainContext);
  const fallback = useDefaultChain();
  const chainId = page?.chainId ?? fallback;
  if (chainId === null) return null;
  return <Navigate to={paths.ongoing(chainId)} replace />;
}

/**
 * A chain-less legacy path (`/ongoing`, `/create`, `/cases/5`, `/interact/5`, `/disputes`; D-01): the same path, search
 * and hash under the default chain once the wallet has settled.
 */
export function ChainlessRedirect() {
  const location = useLocation();
  const chainId = useDefaultChain();
  if (chainId === null) return null;
  return <Navigate to={{ pathname: replaceChainSegment(location.pathname, chainId), search: location.search, hash: location.hash }} replace />;
}

/**
 * `/:chainId/interact/:id/*` (spec §1.2): the case page of that dispute. Targets are built from the parsed ID only
 * (A19), so an ID that does not parse renders the case page's not-found state in place, without navigating (P-11).
 */
export function InteractRedirect() {
  const page = useContext(PageChainContext);
  const { id = "" } = useParams();
  const disputeId = parseDisputeId(id);
  if (page === null) return null;
  if (disputeId === null) return <DisputeNotFoundScreen chainId={page.chainId} id={id} />;
  return <Navigate to={paths.case(page.chainId, disputeId)} replace />;
}
