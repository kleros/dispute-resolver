import type { ReactNode } from "react";
import type { Address, AttachmentLink, Env, GatewayOrigin, MetaEvidence } from "@dispute-resolver/core";

export interface ExternalLinkProps {
  readonly href: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

export interface SafeMarkdownProps {
  readonly source: string;
  readonly className?: string;
}

export interface AttachmentProps {
  readonly attachment: AttachmentLink | null;
}

export interface EvidenceDisplayInput {
  readonly metaEvidence: MetaEvidence;
  /** The page chain (the arbitrator's chain). */
  readonly arbitratorChainId: number;
  readonly disputeId: bigint;
  /** From the arbitrator binding, never from meta-evidence. */
  readonly arbitrable: Address;
  /** `klerosLiquid` of the page chain. */
  readonly arbitrator: Address;
  readonly env: Env;
  readonly gateway: GatewayOrigin;
  readonly appOrigin: string;
}

/** The query an evidence display receives; an RPC URL is `null` when none is configured. */
export interface DisplayParams {
  readonly disputeID: string;
  readonly chainID: number;
  readonly arbitratorContractAddress: Address;
  readonly arbitratorJsonRpcUrl: string | null;
  readonly arbitratorChainID: number;
  readonly arbitrableContractAddress: Address;
  readonly arbitrableChainID: number;
  readonly arbitrableJsonRpcUrl: string | null;
  readonly jsonRpcUrl: string | null;
}

export type SandboxToken = "allow-scripts" | "allow-same-origin" | "allow-popups" | "allow-popups-to-escape-sandbox";

export interface EvidenceDisplayModel {
  readonly src: string;
  readonly srcOrigin: string;
  readonly params: DisplayParams;
  readonly sandbox: readonly SandboxToken[];
  /** `_v` absent or "0" → JSON in the query; anything else → `URLSearchParams`. */
  readonly encoding: "json" | "search-params";
}

/** Callers render nothing when `buildEvidenceDisplay` returns `null`. */
export interface EvidenceDisplayFrameProps {
  readonly model: EvidenceDisplayModel;
  /** Called with nothing when the page loads, so no caller can reach the event, the frame or its source. */
  readonly onLoad?: () => void;
}
