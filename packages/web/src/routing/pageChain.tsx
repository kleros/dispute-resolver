import { DEFAULT_CHAIN_ID, chainCapabilities, getChain, parseChainId, type ChainId } from "@dispute-resolver/core";
import { createContext, useContext, useMemo } from "react";
import { useParams } from "react-router";
import { useWallet } from "../wallet";
import type { PageChain, ResolvedChain } from "./types";

/** The name of the chain parameter of the `/:chainId` layout route. */
export const CHAIN_PARAM = "chainId";

/** The page chain of a configured chain ID; `undefined` for any other number. */
export function toPageChain(chainId: ChainId): PageChain | undefined {
  const chain = getChain(chainId);
  return chain === undefined ? undefined : { chainId: chain.id, chain, capabilities: chainCapabilities(chain) };
}

function requirePageChain(chainId: ChainId): PageChain {
  const page = toPageChain(chainId);
  if (page === undefined) throw new Error(`Chain ${String(chainId)} is not configured.`);
  return page;
}

/**
 * The chain the header and footer use (D-45): the URL's chain when it is configured; otherwise the connected wallet's
 * chain when it is configured, else the default chain, keeping the unparsed segment for the unsupported-network heading.
 */
export function resolveChain(segment: string | undefined, walletChainId: number | undefined): ResolvedChain {
  const urlChainId = parseChainId(segment);
  if (urlChainId !== undefined) return { kind: "page", page: requirePageChain(urlChainId) };
  const walletPage = walletChainId === undefined ? undefined : toPageChain(walletChainId);
  return { kind: "fallback", page: walletPage ?? requirePageChain(DEFAULT_CHAIN_ID), unsupportedSegment: segment ?? null };
}

/** The page chain set by `ChainLayout`; `null` outside a configured `/:chainId`. */
export const PageChainContext = createContext<PageChain | null>(null);

/** The chain named by the URL (ARCHITECTURE.md §3.2). Only screens under a configured `/:chainId` may call it. */
export function usePageChain(): PageChain {
  const page = useContext(PageChainContext);
  if (page === null) throw new Error("usePageChain is called outside the /:chainId layout of a configured chain.");
  return page;
}

/** The connected wallet's chain, or `undefined` while no wallet is connected. */
export function useConnectedChainId(): number | undefined {
  const wallet = useWallet();
  return wallet.status === "connected" ? wallet.chainId : undefined;
}

/** `resolveChain` for the current route and wallet (ARCHITECTURE.md §3.2): works on every screen. */
export function useResolvedChain(): ResolvedChain {
  const segment = useParams()[CHAIN_PARAM];
  const walletChainId = useConnectedChainId();
  return useMemo(() => resolveChain(segment, walletChainId), [segment, walletChainId]);
}
