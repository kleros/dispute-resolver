import type { Address, Fetcher, Hex, ReadClient, UnixSeconds } from "../types";
import type { AttachmentLink, CanonicalIpfsPath, GatewayOrigin } from "../uri/types";

export interface DisputeEvent {
  readonly metaEvidenceId: bigint;
  readonly evidenceGroupId: bigint;
  readonly blockNumber: bigint;
  /** Block timestamp: the "Dispute Raised" time of the evidence panel. */
  readonly createdAt: UnixSeconds;
  readonly transactionHash: Hex;
}

/** Exactly one `Dispute` log is required; zero or several are reported, not thrown. */
export type DisputeEventResult =
  { readonly status: "found"; readonly event: DisputeEvent } | { readonly status: "not-found" } | { readonly status: "ambiguous"; readonly count: number };

/** The latest emission of the `MetaEvidence` event for one meta-evidence ID. */
export interface MetaEvidenceEvent {
  /** The raw, untrusted `_evidence` string; content addressing is checked by the meta-evidence pipeline. */
  readonly uri: string;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly transactionHash: Hex;
  /** How many `MetaEvidence` logs the arbitrable emitted for this ID; the latest one is `uri`. */
  readonly emissions: number;
}

/** Several emissions of one ID are not ambiguous: the latest by block and log index wins. */
export type MetaEvidenceEventResult = { readonly status: "found"; readonly event: MetaEvidenceEvent } | { readonly status: "not-found" };

export interface EvidenceLog {
  readonly evidenceUri: string;
  readonly submitter: Address;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly transactionHash: Hex;
}

export interface EvidenceItem {
  /** `title`, or `name` when `title` is empty. */
  readonly title: string;
  /** Plain text, never markdown. */
  readonly description: string;
  readonly submitter: Address;
  readonly timestamp: UnixSeconds;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly uri: CanonicalIpfsPath;
  /** From `fileURI`, or the legacy `evidence` key; never fetched, never rendered inline. */
  readonly attachment: AttachmentLink | null;
}

/** `undecodable` is an Evidence log whose `_evidence` or `_party` did not decode, so it has no URI to judge. */
export type HiddenEvidenceReason = "undecodable" | "not-content-addressed" | "fetch-failed" | "not-json" | "schema-invalid";

export interface EvidenceList {
  /** Newest first. */
  readonly items: readonly EvidenceItem[];
  /** The sum of `hiddenByReason`. */
  readonly hiddenEvidenceCount: number;
  readonly hiddenByReason: Readonly<Record<HiddenEvidenceReason, number>>;
}

export interface EvidenceContext {
  readonly client: ReadClient;
  readonly fetcher: Fetcher;
  readonly gateway: GatewayOrigin;
  /** Read from the arbitrator, never from meta-evidence. */
  readonly arbitrable: Address;
  readonly arbitrator: Address;
  readonly evidenceGroupId: bigint;
  /** First block of the scan: the chain's `arbitratorDeployedAtBlock` (or 0). */
  readonly fromBlock: bigint;
  readonly signal?: AbortSignal;
}

/** The evidence JSON the app uploads before `submitEvidence`. */
export interface EvidenceDocument {
  readonly name: string;
  readonly description: string;
  /** `""` without an attachment. */
  readonly fileURI: CanonicalIpfsPath | "";
  readonly evidenceSide: 0;
}
