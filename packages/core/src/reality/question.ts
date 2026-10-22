import type { RealityProxyEntry } from "../registry/types";
import type { ChainId } from "../types";
import { readCachedQuestion, realityQuestionCacheKey, writeCachedQuestion } from "./cache";
import { KNOWN_DISPUTE_QUESTIONS } from "./knownQuestions.generated";
import { lookupRealityQuestion } from "./lookup";
import type { LookupReadClients, RealityQuestion, RealityQuestionCache } from "./types";

interface SharedLookup {
  readonly promise: Promise<RealityQuestion>;
  readonly controller: AbortController;
  waiters: number;
}

const inFlightLookups = new Map<string, SharedLookup>();

function knownDisputeKey(arbitratorChainId: ChainId, entry: RealityProxyEntry, disputeId: bigint): string {
  return `${String(arbitratorChainId)}:${entry.proxy}:${String(disputeId)}`;
}

function startSharedLookup(key: string, start: (signal: AbortSignal) => Promise<RealityQuestion>): SharedLookup {
  const controller = new AbortController();
  const promise = start(controller.signal).finally(() => {
    if (inFlightLookups.get(key)?.controller === controller) inFlightLookups.delete(key);
  });
  const shared: SharedLookup = { promise, controller, waiters: 0 };
  inFlightLookups.set(key, shared);
  return shared;
}

function abortError(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error ? signal.reason : new DOMException("The lookup was aborted.", "AbortError");
}

/** The lookup itself stops only once no caller is waiting, so one caller's abort never fails the others. */
function waitForLookup(key: string, shared: SharedLookup, signal: AbortSignal | undefined): Promise<RealityQuestion> {
  shared.waiters += 1;
  return new Promise<RealityQuestion>((resolve, reject) => {
    const onAbort = () => {
      shared.waiters -= 1;
      if (shared.waiters === 0) {
        if (inFlightLookups.get(key) === shared) inFlightLookups.delete(key);
        shared.controller.abort(signal?.reason);
      }
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    shared.promise.then(resolve, reject).finally(() => {
      signal?.removeEventListener("abort", onAbort);
    });
  });
}

/**
 * Failures are never cached. Concurrent lookups of the same dispute share one in-flight promise.
 *
 * Rejects on a missing client for either chain, RPC errors, an exhausted request budget or deadline, an abort of
 * `signal`, and inconsistent data.
 */
export async function fetchRealityQuestion(request: {
  readonly entry: RealityProxyEntry;
  readonly arbitratorChainId: ChainId;
  readonly disputeId: bigint;
  readonly clients: LookupReadClients;
  readonly cache?: RealityQuestionCache;
  readonly deadlineMs?: number;
  readonly signal?: AbortSignal;
}): Promise<RealityQuestion> {
  const { entry, arbitratorChainId, disputeId, clients, cache, deadlineMs, signal } = request;
  if (disputeId < 0n) throw new Error(`Invalid dispute ID ${String(disputeId)}.`);
  signal?.throwIfAborted();

  const key = realityQuestionCacheKey(arbitratorChainId, entry, disputeId);
  const known = KNOWN_DISPUTE_QUESTIONS[knownDisputeKey(arbitratorChainId, entry, disputeId)];
  const cached = readCachedQuestion(cache, key, entry, known);
  if (cached !== undefined) return cached;

  const shared =
    inFlightLookups.get(key) ??
    startSharedLookup(key, async (lookupSignal) => {
      const question = await lookupRealityQuestion({ entry, arbitratorChainId, disputeId, clients, known, deadlineMs, signal: lookupSignal });
      writeCachedQuestion(cache, key, question);
      return question;
    });
  return waitForLookup(key, shared, signal);
}
