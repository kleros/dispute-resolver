import type { ComponentType, ReactNode } from "react";
import type { ChainCapabilities, ChainConfig, ChainId } from "@dispute-resolver/core";

/** The chain named by the URL, parsed with core's `parseChainId` (A19). Every read of a page uses it. */
export interface PageChain {
  readonly chainId: ChainId;
  readonly chain: ChainConfig;
  readonly capabilities: ChainCapabilities;
}

/**
 * The chain the header and footer use on every screen (D-45): the page chain when the URL names a configured chain;
 * otherwise the connected wallet's configured chain, else chain 1, with the unparsed URL segment kept for the
 * unsupported-network heading.
 */
export type ResolvedChain =
  { readonly kind: "page"; readonly page: PageChain } | { readonly kind: "fallback"; readonly page: PageChain; readonly unsupportedSegment: string | null };

/** Internal path builders (A19): validated chain IDs and numeric dispute IDs only. */
export interface Paths {
  chainRoot(chainId: ChainId): string;
  ongoing(chainId: ChainId): string;
  create(chainId: ChainId): string;
  cases(chainId: ChainId): string;
  case(chainId: ChainId, disputeId: bigint): string;
}

/** What the route table hands the page frame (structurally shell's `PageFrameProps`; routing never imports shell). */
export interface FrameProps {
  readonly resolvedChain: ResolvedChain;
  readonly children: ReactNode;
}

/** The page frame around every screen (shell's `PageFrame`), injected so routing stays below shell (ARCHITECTURE.md §1.3). */
export type FrameComponent = ComponentType<FrameProps>;

/** Props of `ChainLayout`, the `/:chainId` layout route element (ARCHITECTURE.md §3.1, §3.6). */
export interface ChainLayoutProps {
  readonly frame: FrameComponent;
}

/** The components the route table places (ARCHITECTURE.md §3.1); `AppRoutes.tsx` passes shell's frame and the pages. */
export interface AppRouteComponents {
  readonly PageFrame: FrameComponent;
  readonly OngoingPage: ComponentType;
  readonly CreatePage: ComponentType;
  /** Serves `/:chainId/cases` (no ID, D-09) and `/:chainId/cases/:id`; it reads `:id` and parses it with `parseDisputeId`. */
  readonly CasePage: ComponentType;
}

/** Props of `UnsupportedNetworkScreen` (spec §2.5). */
export interface UnsupportedNetworkScreenProps {
  /** The URL's first segment as written (decoded by the router), shown as text in the heading. */
  readonly segment: string;
}
