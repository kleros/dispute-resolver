import type { Address, ChainId, Fetcher, Hex, ReadClient, UnixSeconds } from "../types";
import type { AttachmentLink, CanonicalIpfsPath, GatewayOrigin } from "../uri/types";

/** The ERC-1497 `Dispute` event of a dispute on its arbitrable (archon `getDispute` replacement). */
export interface DisputeEvent {
  readonly metaEvidenceId: bigint;
  readonly evidenceGroupId: bigint;
  readonly blockNumber: bigint;
  /** Block timestamp: the "Dispute Raised" time of the evidence panel. */
  readonly createdAt: UnixSeconds;
  readonly transactionHash: Hex;
}

/** Exactly one `Dispute` log is required; zero or several are reported, not thrown (D-36). */
export type DisputeEventResult =
  { readonly status: "found"; readonly event: DisputeEvent } | { readonly status: "not-found" } | { readonly status: "ambiguous"; readonly count: number };

/** One raw ERC-1497 `Evidence` log, before its JSON is fetched. */
export interface EvidenceLog {
  readonly evidenceUri: string;
  readonly submitter: Address;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly transactionHash: Hex;
}

/** One evidence entry that passed content addressing (D-22) and the schema (A17). */
export interface EvidenceItem {
  /** `title`, or `name` when `title` is empty (spec 9.3). */
  readonly title: string;
  /** Plain text, never markdown. */
  readonly description: string;
  readonly submitter: Address;
  readonly timestamp: UnixSeconds;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly uri: CanonicalIpfsPath;
  /** From `fileURI`, or the legacy `evidence` key; never fetched, never rendered inline (A17, B7). */
  readonly attachment: AttachmentLink | null;
}

/**
 * Why an entry was hidden. Counted, never silently dropped (D-22). `undecodable` is an Evidence log whose `_evidence` or
 * `_party` did not decode, so it has no URI to judge.
 */
export type HiddenEvidenceReason = "undecodable" | "not-content-addressed" | "fetch-failed" | "not-json" | "schema-invalid";

export interface EvidenceList {
  /** Newest first (spec 5.14). */
  readonly items: readonly EvidenceItem[];
  /** How many entries were hidden, for every reason: the sum of `hiddenByReason`. */
  readonly hiddenEvidenceCount: number;
  readonly hiddenByReason: Readonly<Record<HiddenEvidenceReason, number>>;
}

/** Inputs of `loadEvidence`. */
export interface EvidenceContext {
  readonly chainId: ChainId;
  readonly client: ReadClient;
  readonly fetcher: Fetcher;
  readonly gateway: GatewayOrigin;
  /** From the arbitrator (A22). */
  readonly arbitrable: Address;
  readonly arbitrator: Address;
  readonly evidenceGroupId: bigint;
  /** First block of the scan: the chain's `arbitratorDeployedAtBlock` (or 0). */
  readonly fromBlock: bigint;
  readonly signal?: AbortSignal;
}

/** The evidence JSON the app uploads (spec 5.14 step 1); `evidenceSide` is always 0. */
export interface EvidenceDocument {
  readonly name: string;
  readonly description: string;
  /** `""` without an attachment. */
  readonly fileURI: CanonicalIpfsPath | "";
  readonly evidenceSide: 0;
}
