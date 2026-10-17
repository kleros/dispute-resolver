import type { ReactNode } from "react";
import type { Address, AttachmentLink, ChainId, Env, GatewayOrigin, MetaEvidence } from "@dispute-resolver/core";

/** The only external anchor of the app (A10, B19, D-32): https only, new tab, `rel="noopener noreferrer"`. */
export interface ExternalLinkProps {
  readonly href: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

/** Untrusted markdown (A11, B14, D-31). */
export interface SafeMarkdownProps {
  readonly source: string;
  readonly className?: string;
}

/** Renders core's attachment reference as a link or as text, never inline (A17). */
export interface AttachmentProps {
  readonly attachment: AttachmentLink | null;
}

/** Inputs of the evidence-display iframe (spec 9.4, A8, C5, D-34, D-35). */
export interface EvidenceDisplayInput {
  readonly metaEvidence: MetaEvidence;
  /** The page chain (the arbitrator's chain). */
  readonly arbitratorChainId: ChainId;
  readonly disputeId: bigint;
  /** From the arbitrator binding, never from meta-evidence (A22). */
  readonly arbitrable: Address;
  /** `klerosLiquid` of the page chain. */
  readonly arbitrator: Address;
  readonly env: Env;
  readonly gateway: GatewayOrigin;
  readonly appOrigin: string;
}

/** Query parameters given to an evidence display (spec 9.4 with D-35 public RPC URLs; `null` when unconfigured). */
export interface DisplayParams {
  readonly disputeID: string;
  readonly chainID: ChainId;
  readonly arbitratorContractAddress: Address;
  readonly arbitratorJsonRpcUrl: string | null;
  readonly arbitratorChainID: ChainId;
  readonly arbitrableContractAddress: Address;
  readonly arbitrableChainID: ChainId;
  readonly arbitrableJsonRpcUrl: string | null;
  readonly jsonRpcUrl: string | null;
}

export type SandboxToken = "allow-scripts" | "allow-same-origin" | "allow-popups" | "allow-popups-to-escape-sandbox";

/** The computed evidence-display iframe. */
export interface EvidenceDisplayModel {
  readonly src: string;
  readonly srcOrigin: string;
  readonly params: DisplayParams;
  readonly sandbox: readonly SandboxToken[];
  /** `_v` absent or "0" → JSON in the query; anything else → `URLSearchParams`. */
  readonly encoding: "json" | "search-params";
}

/** Renders the computed evidence-display iframe; callers render nothing when `buildEvidenceDisplay` returns `null`. */
export interface EvidenceDisplayFrameProps {
  readonly model: EvidenceDisplayModel;
}
