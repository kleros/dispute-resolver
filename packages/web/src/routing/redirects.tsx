import { DEFAULT_CHAIN_ID, parseChainId, parseDisputeId } from "@dispute-resolver/core";
import { useContext } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { useWallet } from "../wallet";
import { DisputeNotFoundScreen } from "./DisputeNotFoundScreen";
import { PageChainContext } from "./pageChain";
import { paths, replaceChainSegment } from "./paths";

/**
 * `null` while wagmi is still reconnecting a returning wallet, so that user lands on their wallet's chain instead of
 * being moved there afterwards.
 */
function useDefaultChain(): number | null {
  const wallet = useWallet();
  if (wallet.status === "connecting") return null;
  if (wallet.status === "connected") return parseChainId(wallet.chainId) ?? DEFAULT_CHAIN_ID;
  return DEFAULT_CHAIN_ID;
}

export function RedirectToOngoing() {
  const page = useContext(PageChainContext);
  const fallback = useDefaultChain();
  const chainId = page?.chainId ?? fallback;
  if (chainId === null) return null;
  return <Navigate to={paths.ongoing(chainId)} replace />;
}

export function ChainlessRedirect() {
  const location = useLocation();
  const chainId = useDefaultChain();
  if (chainId === null) return null;
  return <Navigate to={{ pathname: replaceChainSegment(location.pathname, chainId), search: location.search, hash: location.hash }} replace />;
}

/**
 * Targets are built from the parsed ID only, so an ID that does not parse renders the not-found state in place, without
 * navigating.
 */
export function InteractRedirect() {
  const page = useContext(PageChainContext);
  const { id = "" } = useParams();
  const disputeId = parseDisputeId(id);
  if (page === null) return null;
  if (disputeId === null) return <DisputeNotFoundScreen chainId={page.chainId} id={id} />;
  return <Navigate to={paths.case(page.chainId, disputeId)} replace />;
}
