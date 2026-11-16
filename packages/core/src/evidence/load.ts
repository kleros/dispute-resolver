import { isBodyTooLargeError } from "../fetch";
import { describeError } from "../rpc";
import type { Address, FetchInit, Outcome, ReadClient } from "../types";
import { gatewayUrl, normalizeIpfsPath } from "../uri";
import type { CanonicalIpfsPath } from "../uri/types";
import { scanEvidenceLogs } from "./events";
import { fail, succeed } from "../outcome";
import { evidencePage, FIRST_EVIDENCE_PAGE } from "./pages";
import { parseEvidenceDocument } from "./schema";
import type { EvidenceContext, EvidenceEntry, EvidenceFileStatus, EvidenceItem, EvidenceList, EvidenceLog, EvidencePageContext, EvidencePageRequest } from "./types";

/** Evidence documents fetched at once, and block timestamps read at once. */
const CONCURRENCY = 6;

/** The largest real evidence document is 38 KB; a larger one is never read past this, and its entry says it is too large. */
export const EVIDENCE_DOCUMENT_MAX_BYTES = 65_536;

type Document = Pick<EvidenceItem, "title" | "description" | "attachment">;

type DocumentContext = Pick<EvidencePageContext, "fetcher" | "gateway" | "signal">;

type Fetched = { readonly status: "shown"; readonly document: Document } | { readonly status: EvidenceFileStatus };

const TOO_LARGE: Fetched = { status: "too-large" };
const FETCH_FAILED: Fetched = { status: "fetch-failed" };

/** A page log whose document is read, or why it is not. */
type Judged =
  | { readonly kind: "fetch"; readonly log: EvidenceLog; readonly uri: CanonicalIpfsPath; readonly submitter: Address }
  | { readonly kind: "not-content-addressed"; readonly log: EvidenceLog; readonly address: string; readonly submitter: Address }
  | { readonly kind: "undecodable"; readonly log: EvidenceLog; readonly submitter: Address | null };

/**
 * Reads every Evidence log, then the documents of one page (`context.page`, the newest page by default). Never rejects: a
 * failed log or block read, or an abort, is `rpc-error`.
 */
export async function loadEvidence(context: EvidenceContext): Promise<Outcome<EvidenceList>> {
  try {
    const logs = await scanEvidenceLogs(context);
    return succeed(await readPage(context, logs, context.page ?? FIRST_EVIDENCE_PAGE));
  } catch (error) {
    return fail("rpc-error", `Could not read the evidence: ${describeError(error)}`);
  }
}

/** Reads the documents of another page of logs `loadEvidence` read, without reading the logs again. Never rejects, as `loadEvidence`. */
export async function loadEvidencePage(context: EvidencePageContext, logs: readonly EvidenceLog[], request: EvidencePageRequest): Promise<Outcome<EvidenceList>> {
  try {
    return succeed(await readPage(context, logs, request));
  } catch (error) {
    return fail("rpc-error", `Could not read the evidence: ${describeError(error)}`);
  }
}

/**
 * Reads the document of one log of a loaded page again through the same check and fetch as its page; `timestamp` is the
 * block time that page read gave it, so no block is read. A log whose URI is not content-addressed, or whose data does
 * not decode, is never fetched and gives the entry its page gave. Never rejects: a failed or aborted fetch is
 * `fetch-failed`, so a caller whose signal aborted drops the result.
 */
export async function loadEvidenceEntry(context: DocumentContext, log: EvidenceLog, timestamp: number): Promise<EvidenceEntry> {
  const judged = judge(log);
  const fetched = new Map<CanonicalIpfsPath, Fetched>();
  if (judged.kind === "fetch") fetched.set(judged.uri, await fetchDocument(context, judged.uri));
  return entryOf(judged, fetched, new Map([[log.blockNumber, timestamp]]));
}

/**
 * Every log of the page gets an entry with its block's time. A URI that fails `normalizeIpfsPath` is never fetched,
 * http(s) included, and each canonical URI is fetched once. Rejects when a block cannot be read or the signal aborts.
 */
async function readPage(context: EvidencePageContext, logs: readonly EvidenceLog[], request: EvidencePageRequest): Promise<EvidenceList> {
  const { signal } = context;
  signal?.throwIfAborted();
  const slice = evidencePage(logs, request);
  const judged = slice.logs.map(judge);
  const uris = new Set<CanonicalIpfsPath>();
  for (const entry of judged) if (entry.kind === "fetch") uris.add(entry.uri);
  const fetched = new Map(await mapBounded([...uris], async (uri) => [uri, await fetchDocument(context, uri)] as const));
  signal?.throwIfAborted();

  const timestamps = await blockTimestamps(context.client, [...new Set(slice.logs.map((log) => log.blockNumber))]);
  const entries = judged.map((entry) => entryOf(entry, fetched, timestamps));
  return { logs, page: { order: request.order, page: slice.page }, entries };
}

function judge(log: EvidenceLog): Judged {
  if (log.decoded === null) return { kind: "undecodable", log, submitter: log.party };
  const { evidenceUri, submitter } = log.decoded;
  const uri = normalizeIpfsPath(evidenceUri);
  return uri === null ? { kind: "not-content-addressed", log, address: evidenceUri, submitter } : { kind: "fetch", log, uri, submitter };
}

function entryOf(entry: Judged, fetched: ReadonlyMap<CanonicalIpfsPath, Fetched>, timestamps: ReadonlyMap<bigint, number>): EvidenceEntry {
  const { log } = entry;
  const place = { blockNumber: log.blockNumber, logIndex: log.logIndex };
  const timestamp = timestampOf(timestamps, log.blockNumber);
  if (entry.kind === "undecodable") return { ...place, status: entry.kind, evidence: { submitter: entry.submitter, timestamp } };
  const { submitter } = entry;
  if (entry.kind === "not-content-addressed") return { ...place, status: entry.kind, evidence: { submitter, timestamp, address: entry.address } };
  const result = fetched.get(entry.uri);
  if (result === undefined) throw new Error(`No fetch for ${entry.uri}.`);
  if (result.status !== "shown") return { ...place, status: result.status, evidence: { submitter, timestamp, uri: entry.uri } };
  return { ...place, status: "shown", item: { ...result.document, submitter, timestamp, blockNumber: log.blockNumber, transactionHash: log.transactionHash, uri: entry.uri } };
}

/**
 * Never rejects: a successful answer whose body is over `EVIDENCE_DOCUMENT_MAX_BYTES` is `too-large`, every other failure
 * says why the document is not shown. Only a parse failure is `not-json`; a body read that is cut short is a failed fetch.
 */
async function fetchDocument({ fetcher, gateway, signal }: DocumentContext, uri: CanonicalIpfsPath): Promise<Fetched> {
  const init: FetchInit = signal === undefined ? { maxBytes: EVIDENCE_DOCUMENT_MAX_BYTES } : { signal, maxBytes: EVIDENCE_DOCUMENT_MAX_BYTES };
  let body: unknown;
  try {
    const response = await fetcher(gatewayUrl(uri, gateway), init);
    if (!response.ok) return FETCH_FAILED;
    try {
      body = await response.json();
    } catch (error) {
      if (isBodyTooLargeError(error)) return TOO_LARGE;
      return error instanceof SyntaxError ? { status: "not-json" } : FETCH_FAILED;
    }
  } catch (error) {
    // A failed gateway answer is refused against the fetcher's own, larger cap: it is no document over ours.
    return isBodyTooLargeError(error) && error.maxBytes <= EVIDENCE_DOCUMENT_MAX_BYTES ? TOO_LARGE : FETCH_FAILED;
  }
  const document = parseEvidenceDocument(body, gateway);
  return document.ok ? { status: "shown", document: document.value } : { status: "schema-invalid" };
}

/** Rejects when a block cannot be read. */
async function blockTimestamps(client: ReadClient, blockNumbers: readonly bigint[]): Promise<ReadonlyMap<bigint, number>> {
  const entries = await mapBounded(blockNumbers, async (blockNumber) => [blockNumber, Number((await client.getBlock({ blockNumber })).timestamp)] as const);
  return new Map(entries);
}

function timestampOf(timestamps: ReadonlyMap<bigint, number>, blockNumber: bigint): number {
  const timestamp = timestamps.get(blockNumber);
  if (timestamp === undefined) throw new Error(`No timestamp for block ${String(blockNumber)}.`);
  return timestamp;
}

/** Results keep input order. */
async function mapBounded<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const queue = items.entries();
  const worker = async (): Promise<void> => {
    for (const [index, item] of queue) results[index] = await task(item);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}
