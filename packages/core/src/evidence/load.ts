import { isBodyTooLargeError } from "../fetch";
import { describeError } from "../rpc";
import type { Address, Fetcher, FetchInit, Outcome, ReadClient } from "../types";
import { gatewayUrl, normalizeIpfsPath } from "../uri";
import type { CanonicalIpfsPath, GatewayOrigin } from "../uri/types";
import { scanEvidenceLogs } from "./events";
import { fail, succeed } from "../outcome";
import { evidencePage, FIRST_EVIDENCE_PAGE } from "./pages";
import { parseEvidenceDocument } from "./schema";
import type { EvidenceContext, EvidenceEntry, EvidenceItem, EvidenceList, EvidenceLog, EvidencePageContext, EvidencePageRequest, HiddenEvidenceReason } from "./types";

/** Evidence documents fetched at once, and block timestamps read at once. */
const CONCURRENCY = 6;

/** The largest real evidence document is 38 KB; a larger one is never read past this, and its entry says it is too large. */
export const EVIDENCE_DOCUMENT_MAX_BYTES = 65_536;

type Document = Pick<EvidenceItem, "title" | "description" | "attachment">;

type Fetched =
  | { readonly status: "shown"; readonly document: Document }
  | { readonly status: "too-large" }
  | { readonly status: "hidden"; readonly reason: Exclude<HiddenEvidenceReason, "undecodable" | "not-content-addressed"> };

const TOO_LARGE: Fetched = { status: "too-large" };
const FETCH_FAILED: Fetched = { status: "hidden", reason: "fetch-failed" };

/** A page log whose document is read, or why it is not. */
type Judged =
  | { readonly kind: "fetch"; readonly log: EvidenceLog; readonly uri: CanonicalIpfsPath; readonly submitter: Address }
  | { readonly kind: "hidden"; readonly log: EvidenceLog; readonly reason: "undecodable" | "not-content-addressed" };

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
 * A URI that fails `normalizeIpfsPath` is never fetched, http(s) included, and each canonical URI is fetched once. Hidden
 * entries are counted by reason for the page, never dropped silently. Rejects when a block cannot be read or the signal
 * aborts.
 */
async function readPage(context: EvidencePageContext, logs: readonly EvidenceLog[], request: EvidencePageRequest): Promise<EvidenceList> {
  const { signal } = context;
  signal?.throwIfAborted();
  const slice = evidencePage(logs, request);
  const judged = slice.logs.map(judge);
  const uris = new Set<CanonicalIpfsPath>();
  for (const entry of judged) if (entry.kind === "fetch") uris.add(entry.uri);
  const fetched = new Map(
    await mapBounded([...uris], async (uri) => [uri, await fetchDocument(context.fetcher, gatewayUrl(uri, context.gateway), context.gateway, signal)] as const),
  );
  signal?.throwIfAborted();

  const timed = new Set<bigint>();
  for (const entry of judged) if (entry.kind === "fetch" && fetched.get(entry.uri)?.status !== "hidden") timed.add(entry.log.blockNumber);
  const timestamps = await blockTimestamps(context.client, [...timed]);

  const hiddenByReason: Record<HiddenEvidenceReason, number> = { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 };
  const entries = judged.map((entry) => entryOf(entry, fetched, timestamps));
  for (const entry of entries) if (entry.status === "hidden") hiddenByReason[entry.reason] += 1;
  const hiddenEvidenceCount = Object.values(hiddenByReason).reduce((sum, count) => sum + count, 0);
  return { logs, page: { order: request.order, page: slice.page }, entries, hiddenEvidenceCount, hiddenByReason };
}

function judge(log: EvidenceLog): Judged {
  if (log.decoded === null) return { kind: "hidden", log, reason: "undecodable" };
  const uri = normalizeIpfsPath(log.decoded.evidenceUri);
  return uri === null ? { kind: "hidden", log, reason: "not-content-addressed" } : { kind: "fetch", log, uri, submitter: log.decoded.submitter };
}

function entryOf(entry: Judged, fetched: ReadonlyMap<CanonicalIpfsPath, Fetched>, timestamps: ReadonlyMap<bigint, number>): EvidenceEntry {
  const { log } = entry;
  const place = { blockNumber: log.blockNumber, logIndex: log.logIndex };
  if (entry.kind === "hidden") return { ...place, status: "hidden", reason: entry.reason };
  const result = fetched.get(entry.uri);
  if (result === undefined) throw new Error(`No fetch for ${entry.uri}.`);
  if (result.status === "hidden") return { ...place, status: "hidden", reason: result.reason };
  const { submitter } = entry;
  const timestamp = timestampOf(timestamps, log.blockNumber);
  if (result.status === "too-large") return { ...place, status: "too-large", evidence: { submitter, timestamp, uri: entry.uri } };
  return { ...place, status: "shown", item: { ...result.document, submitter, timestamp, blockNumber: log.blockNumber, transactionHash: log.transactionHash, uri: entry.uri } };
}

/**
 * Never rejects: a successful answer whose body is over `EVIDENCE_DOCUMENT_MAX_BYTES` is `too-large`, every other failure
 * a hidden reason. Only a parse failure is `not-json`; a body read that is cut short is a failed fetch.
 */
async function fetchDocument(fetcher: Fetcher, url: string, gateway: GatewayOrigin, signal: AbortSignal | undefined): Promise<Fetched> {
  const init: FetchInit = signal === undefined ? { maxBytes: EVIDENCE_DOCUMENT_MAX_BYTES } : { signal, maxBytes: EVIDENCE_DOCUMENT_MAX_BYTES };
  let body: unknown;
  try {
    const response = await fetcher(url, init);
    if (!response.ok) return FETCH_FAILED;
    try {
      body = await response.json();
    } catch (error) {
      if (isBodyTooLargeError(error)) return TOO_LARGE;
      return error instanceof SyntaxError ? { status: "hidden", reason: "not-json" } : FETCH_FAILED;
    }
  } catch (error) {
    // A failed gateway answer is refused against the fetcher's own, larger cap: it is no document over ours.
    return isBodyTooLargeError(error) && error.maxBytes <= EVIDENCE_DOCUMENT_MAX_BYTES ? TOO_LARGE : FETCH_FAILED;
  }
  const document = parseEvidenceDocument(body, gateway);
  return document.ok ? { status: "shown", document: document.value } : { status: "hidden", reason: "schema-invalid" };
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
