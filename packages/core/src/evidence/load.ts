import { describeError } from "../rpc";
import type { Fetcher, Outcome, ReadClient } from "../types";
import { gatewayUrl, normalizeIpfsPath } from "../uri";
import type { CanonicalIpfsPath, GatewayOrigin } from "../uri/types";
import { scanEvidenceLogs } from "./events";
import { fail, succeed } from "../outcome";
import { parseEvidenceDocument } from "./schema";
import type { EvidenceContext, EvidenceItem, EvidenceList, EvidenceLog, HiddenEvidenceReason } from "./types";

/** Evidence documents fetched at once, and block timestamps read at once. */
const CONCURRENCY = 6;

type Document = Pick<EvidenceItem, "title" | "description" | "attachment">;

type Fetched = { readonly status: "shown"; readonly document: Document } | { readonly status: "hidden"; readonly reason: HiddenEvidenceReason };

interface Candidate {
  readonly log: EvidenceLog;
  readonly uri: CanonicalIpfsPath;
}

/**
 * A URI that fails `normalizeIpfsPath` is never fetched, http(s) included. Hidden entries are counted by reason, never
 * dropped silently. Items are newest first; entries with the same time keep chain order because the sort is stable.
 * Never rejects: a failed log or block read, or an abort, is `rpc-error`.
 */
export async function loadEvidence(context: EvidenceContext): Promise<Outcome<EvidenceList>> {
  const { client, signal } = context;
  try {
    const scan = await scanEvidenceLogs(context);
    const hiddenByReason: Record<HiddenEvidenceReason, number> = {
      undecodable: scan.undecodable,
      "not-content-addressed": 0,
      "fetch-failed": 0,
      "not-json": 0,
      "schema-invalid": 0,
    };
    const candidates: Candidate[] = [];
    for (const log of scan.logs) {
      const uri = normalizeIpfsPath(log.evidenceUri);
      if (uri === null) hiddenByReason["not-content-addressed"] += 1;
      else candidates.push({ log, uri });
    }

    const fetched = await mapBounded(candidates, async (candidate) => ({
      candidate,
      result: await fetchDocument(context.fetcher, gatewayUrl(candidate.uri, context.gateway), context.gateway, signal),
    }));
    signal?.throwIfAborted();
    const shown: { readonly candidate: Candidate; readonly document: Document }[] = [];
    for (const { candidate, result } of fetched) {
      if (result.status === "shown") shown.push({ candidate, document: result.document });
      else hiddenByReason[result.reason] += 1;
    }

    const timestamps = await blockTimestamps(
      client,
      shown.map(({ candidate }) => candidate.log.blockNumber),
    );
    const items = shown.map(({ candidate: { log, uri }, document }) => ({
      ...document,
      submitter: log.submitter,
      timestamp: timestampOf(timestamps, log.blockNumber),
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      uri,
    }));
    items.sort((a, b) => b.timestamp - a.timestamp);

    const hiddenEvidenceCount = Object.values(hiddenByReason).reduce((sum, count) => sum + count, 0);
    return succeed({ items, hiddenEvidenceCount, hiddenByReason });
  } catch (error) {
    return fail("rpc-error", `Could not read the evidence: ${describeError(error)}`);
  }
}

/** Never rejects: every failure is a hidden reason. Only a parse failure is `not-json`; a body read that is cut short is a failed fetch. */
async function fetchDocument(fetcher: Fetcher, url: string, gateway: GatewayOrigin, signal: AbortSignal | undefined): Promise<Fetched> {
  let body: unknown;
  try {
    const response = await fetcher(url, signal === undefined ? undefined : { signal });
    if (!response.ok) return { status: "hidden", reason: "fetch-failed" };
    try {
      body = await response.json();
    } catch (error) {
      return { status: "hidden", reason: error instanceof SyntaxError ? "not-json" : "fetch-failed" };
    }
  } catch {
    return { status: "hidden", reason: "fetch-failed" };
  }
  const document = parseEvidenceDocument(body, gateway);
  return document.ok ? { status: "shown", document: document.value } : { status: "hidden", reason: "schema-invalid" };
}

/** Rejects when a block cannot be read. */
async function blockTimestamps(client: ReadClient, blockNumbers: readonly bigint[]): Promise<ReadonlyMap<bigint, number>> {
  const distinct = [...new Set(blockNumbers)];
  const entries = await mapBounded(distinct, async (blockNumber) => [blockNumber, Number((await client.getBlock({ blockNumber })).timestamp)] as const);
  return new Map(entries);
}

function timestampOf(timestamps: ReadonlyMap<bigint, number>, blockNumber: bigint): number {
  const timestamp = timestamps.get(blockNumber);
  if (timestamp === undefined) throw new Error(`No timestamp for block ${String(blockNumber)}.`);
  return timestamp;
}

/** Results keep input order, which the stable newest-first sort in `loadEvidence` relies on. */
async function mapBounded<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const queue = items.entries();
  const worker = async (): Promise<void> => {
    for (const [index, item] of queue) results[index] = await task(item);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}
