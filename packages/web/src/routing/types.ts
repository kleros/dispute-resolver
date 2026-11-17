import type { ComponentType, ReactNode } from "react";
import type { ChainCapabilities, ChainConfig } from "@dispute-resolver/core";

export interface PageChain {
  readonly chainId: number;
  readonly chain: ChainConfig;
  readonly capabilities: ChainCapabilities;
}

/** A fallback keeps the unparsed URL segment for the unsupported-network heading. */
export type ResolvedChain =
  { readonly kind: "page"; readonly page: PageChain } | { readonly kind: "fallback"; readonly page: PageChain; readonly unsupportedSegment: string | null };

export interface PathLocation {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

/** A switch to the page chain that the wallet declined or that failed, after which the app moved to the wallet's chain. */
export interface ChainNotice {
  readonly outcome: "declined" | "failed";
  /** The chain the app moved to; it may be unconfigured. */
  readonly walletChainId: number;
  /** The chain of the page the app left. */
  readonly pageChainId: number;
  /** The dispute of the case page the app left; `null` on any other page or when its ID does not parse. */
  readonly disputeId: bigint | null;
  readonly reason: string;
}

export interface FrameProps {
  readonly resolvedChain: ResolvedChain;
  readonly children: ReactNode;
}

export type FrameComponent = ComponentType<FrameProps>;

export interface AppRouteComponents {
  readonly PageFrame: FrameComponent;
  readonly OngoingPage: ComponentType;
  readonly CreatePage: ComponentType;
  /** Serves `/:chainId/cases` with no ID too; it parses `:id` itself. */
  readonly CasePage: ComponentType;
}
