import type { Address, Fetcher, Hex, ReadClient } from "../types";
import type { AttachmentLink, CanonicalIpfsPath, GatewayOrigin } from "../uri/types";

export interface DisputeEvent {
  readonly metaEvidenceId: bigint;
  readonly evidenceGroupId: bigint;
  readonly blockNumber: bigint;
  /** Block timestamp. */
  readonly createdAt: number;
  readonly transactionHash: Hex;
}

export type DisputeEventResult =
  { readonly status: "found"; readonly event: DisputeEvent } | { readonly status: "not-found" } | { readonly status: "ambiguous"; readonly count: number };

interface MetaEvidenceEvent {
  /** The raw, untrusted `_evidence` string; content addressing is checked by the meta-evidence pipeline. */
  readonly uri: string;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly transactionHash: Hex;
  /** How many `MetaEvidence` logs the arbitrable emitted for this ID; the latest one is `uri`. */
  readonly emissions: number;
}

export type MetaEvidenceEventResult = { readonly status: "found"; readonly event: MetaEvidenceEvent } | { readonly status: "not-found" };

/** Where an Evidence log sits on chain; the timeline orders entries by it. */
export interface EvidencePlace {
  readonly blockNumber: bigint;
  readonly logIndex: number;
}

/**
 * One Evidence log of the evidence group. `decoded` is `null` when its `_evidence` or `_party` does not decode; `party` is
 * `_party` whenever it decodes, so an entry whose `_evidence` does not still says who submitted it.
 */
export interface EvidenceLog extends EvidencePlace {
  readonly transactionHash: Hex;
  readonly party: Address | null;
  readonly decoded: { readonly evidenceUri: string; readonly submitter: Address } | null;
}

export interface EvidenceItem {
  readonly title: string;
  /** Plain text, never markdown. */
  readonly description: string;
  readonly submitter: Address;
  readonly timestamp: number;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly uri: CanonicalIpfsPath;
  /** From `fileURI`, or the legacy `evidence` key; never fetched, never rendered inline. */
  readonly attachment: AttachmentLink | null;
}

export type EvidenceOrder = "newest" | "oldest";

/** `page` counts from 1. */
export interface EvidencePageRequest {
  readonly order: EvidenceOrder;
  readonly page: number;
}

/** A content-addressed document that is not shown: only what the log tells is known, and where the file is. */
export interface EvidenceFile {
  readonly submitter: Address;
  readonly timestamp: number;
  readonly uri: CanonicalIpfsPath;
}

/** A URI that is not content-addressed, never fetched. `address` is the raw, untrusted `_evidence`. */
export interface UnaddressedEvidence {
  readonly submitter: Address;
  readonly timestamp: number;
  readonly address: string;
}

/** An Evidence log whose `_evidence` or `_party` does not decode; `submitter` is `_party` when it decodes. */
export interface UndecodableEvidence {
  readonly submitter: Address | null;
  readonly timestamp: number;
}

/**
 * Why a content-addressed document is not shown: over `EVIDENCE_DOCUMENT_MAX_BYTES` (never read past it), not JSON, JSON
 * that is not an evidence document, or a fetch that failed.
 */
export type EvidenceFileStatus = "too-large" | "not-json" | "schema-invalid" | "fetch-failed";

/** One Evidence log of the loaded page, with what its document gave. Every log of the page has one. */
export type EvidenceEntry = EvidencePlace &
  (
    | { readonly status: "shown"; readonly item: EvidenceItem }
    | { readonly status: EvidenceFileStatus; readonly evidence: EvidenceFile }
    | { readonly status: "not-content-addressed"; readonly evidence: UnaddressedEvidence }
    | { readonly status: "undecodable"; readonly evidence: UndecodableEvidence }
  );

export interface EvidenceList {
  /** Every Evidence log of the evidence group, in chain order; pages are cut from it. */
  readonly logs: readonly EvidenceLog[];
  /** The page whose documents were read. */
  readonly page: EvidencePageRequest;
  /** That page's entries in its order; no other page's document is held. */
  readonly entries: readonly EvidenceEntry[];
}

/** Where a page sits in the chosen order. */
export interface EvidencePageSlice {
  /** The requested page, clamped to `[1, pageCount]`. */
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  /** Positions `[start, end)` of the page in the chosen order, from 0. */
  readonly start: number;
  readonly end: number;
  readonly logs: readonly EvidenceLog[];
  /** Where "Dispute Raised" goes on this page: it is the oldest event, shown only when there is evidence. */
  readonly disputeRaised: "first" | "last" | null;
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
  /** The page whose documents to read; the first page, newest first, without one. */
  readonly page?: EvidencePageRequest;
  readonly signal?: AbortSignal;
}

/** What reading another page of a scanned list needs. */
export type EvidencePageContext = Pick<EvidenceContext, "client" | "fetcher" | "gateway" | "signal">;

/** The evidence JSON the app uploads before `submitEvidence`. */
export interface EvidenceDocument {
  readonly name: string;
  readonly description: string;
  /** `""` without an attachment. */
  readonly fileURI: CanonicalIpfsPath | "";
  readonly evidenceSide: 0;
}
