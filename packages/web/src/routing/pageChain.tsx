import { DEFAULT_CHAIN_ID, chainCapabilities, getChain, parseChainId, type ChainId } from "@dispute-resolver/core";
import { createContext, useContext, useMemo } from "react";
import { useParams } from "react-router";
import { useWallet } from "../wallet";
import { CHAIN_PARAM } from "./paths";
import type { PageChain, ResolvedChain } from "./types";

export function toPageChain(chainId: ChainId): PageChain | undefined {
  const chain = getChain(chainId);
  return chain === undefined ? undefined : { chainId: chain.id, chain, capabilities: chainCapabilities(chain) };
}

function requirePageChain(chainId: ChainId): PageChain {
  const page = toPageChain(chainId);
  if (page === undefined) throw new Error(`Chain ${String(chainId)} is not configured.`);
  return page;
}

export function resolveChain(segment: string | undefined, walletChainId: number | undefined): ResolvedChain {
  const urlChainId = parseChainId(segment);
  if (urlChainId !== undefined) return { kind: "page", page: requirePageChain(urlChainId) };
  const walletPage = walletChainId === undefined ? undefined : toPageChain(walletChainId);
  return { kind: "fallback", page: walletPage ?? requirePageChain(DEFAULT_CHAIN_ID), unsupportedSegment: segment ?? null };
}

/** `null` outside a configured `/:chainId`. */
export const PageChainContext = createContext<PageChain | null>(null);

/** Only screens under a configured `/:chainId` may call it. */
export function usePageChain(): PageChain {
  const page = useContext(PageChainContext);
  if (page === null) throw new Error("usePageChain is called outside the /:chainId layout of a configured chain.");
  return page;
}

export function useConnectedChainId(): number | undefined {
  const wallet = useWallet();
  return wallet.status === "connected" ? wallet.chainId : undefined;
}

/** Unlike `usePageChain`, works on every screen. */
export function useResolvedChain(): ResolvedChain {
  const segment = useParams()[CHAIN_PARAM];
  const walletChainId = useConnectedChainId();
  return useMemo(() => resolveChain(segment, walletChainId), [segment, walletChainId]);
}
