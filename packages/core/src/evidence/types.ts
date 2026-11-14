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

/** One Evidence log of the evidence group. `decoded` is `null` when its `_evidence` or `_party` does not decode. */
export interface EvidenceLog extends EvidencePlace {
  readonly transactionHash: Hex;
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

/** `undecodable` is an Evidence log whose `_evidence` or `_party` did not decode, so it has no URI to judge. */
export type HiddenEvidenceReason = "undecodable" | "not-content-addressed" | "fetch-failed" | "not-json" | "schema-invalid";

export type EvidenceOrder = "newest" | "oldest";

/** `page` counts from 1. */
export interface EvidencePageRequest {
  readonly order: EvidenceOrder;
  readonly page: number;
}

/** A document over `EVIDENCE_DOCUMENT_MAX_BYTES`: never read, so only what the log tells is known. */
export interface TooLargeEvidence {
  readonly submitter: Address;
  readonly timestamp: number;
  readonly uri: CanonicalIpfsPath;
}

/** One Evidence log of the loaded page, with what its document gave. */
export type EvidenceEntry = EvidencePlace &
  (
    | { readonly status: "shown"; readonly item: EvidenceItem }
    | { readonly status: "too-large"; readonly evidence: TooLargeEvidence }
    | { readonly status: "hidden"; readonly reason: HiddenEvidenceReason }
  );

export interface EvidenceList {
  /** Every Evidence log of the evidence group, in chain order; pages are cut from it. */
  readonly logs: readonly EvidenceLog[];
  /** The page whose documents were read. */
  readonly page: EvidencePageRequest;
  /** That page's entries in its order; no other page's document is held. */
  readonly entries: readonly EvidenceEntry[];
  /** The sum of `hiddenByReason`, on the loaded page. */
  readonly hiddenEvidenceCount: number;
  readonly hiddenByReason: Readonly<Record<HiddenEvidenceReason, number>>;
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
