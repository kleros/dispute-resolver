import type { ComponentType, ReactNode } from "react";
import type { ChainCapabilities, ChainConfig, ChainId } from "@dispute-resolver/core";

export interface PageChain {
  readonly chainId: ChainId;
  readonly chain: ChainConfig;
  readonly capabilities: ChainCapabilities;
}

/** A fallback keeps the unparsed URL segment for the unsupported-network heading. */
export type ResolvedChain =
  { readonly kind: "page"; readonly page: PageChain } | { readonly kind: "fallback"; readonly page: PageChain; readonly unsupportedSegment: string | null };

/** The parts of an in-app location that a move to another chain keeps or drops. */
export interface PathLocation {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

/** Validated chain IDs and numeric dispute IDs only. */
export interface Paths {
  chainRoot(chainId: ChainId): string;
  ongoing(chainId: ChainId): string;
  create(chainId: ChainId): string;
  cases(chainId: ChainId): string;
  case(chainId: ChainId, disputeId: bigint): string;
}

/** A switch to the page chain that the wallet declined or that failed, after which the app moved to the wallet's chain. */
export interface ChainNotice {
  readonly outcome: "declined" | "failed";
  /** The chain the app moved to; it may be unconfigured. */
  readonly walletChainId: number;
  /** The chain of the page the app left. */
  readonly pageChainId: ChainId;
  /** The dispute of the case page the app left; `null` on any other page or when its ID does not parse. */
  readonly disputeId: bigint | null;
  /** The switch result's message. */
  readonly reason: string;
}

export interface ChainNoticeProviderProps {
  readonly onNotice: (notice: ChainNotice) => void;
  readonly children?: ReactNode;
}

/** The props of shell's `PageFrame`; defined here because routing never imports shell. */
export interface FrameProps {
  readonly resolvedChain: ResolvedChain;
  readonly children: ReactNode;
}

/** Shell's `PageFrame`, injected so routing stays below shell. */
export type FrameComponent = ComponentType<FrameProps>;

export interface ChainLayoutProps {
  readonly frame: FrameComponent;
}

export interface AppRouteComponents {
  readonly PageFrame: FrameComponent;
  readonly OngoingPage: ComponentType;
  readonly CreatePage: ComponentType;
  /** Serves `/:chainId/cases` with no ID too; it parses `:id` itself. */
  readonly CasePage: ComponentType;
}

export interface UnsupportedNetworkScreenProps {
  /** Decoded by the router; shown as text only. */
  readonly segment: string;
}
