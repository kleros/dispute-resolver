import { z } from "../zod";
import type { RealityProxyEntry } from "../registry/types";
import type { ChainId } from "../types";
import type { KnownDisputeQuestion, RealityQuestion, RealityQuestionCache } from "./types";

const CACHE_PREFIX = "@@kleros/court/reality-question/v1";

const QUESTION_ID = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL_STRING = /^\d+$/;

/**
 * The key of a looked-up question in the persistent cache: today's
 * `@@kleros/court/reality-question/v1/{chain}/{proxy}/{disputeId}` (the cache is shared with the old app's entries).
 */
export function realityQuestionCacheKey(arbitratorChainId: ChainId, entry: RealityProxyEntry, disputeId: bigint): string {
  return `${CACHE_PREFIX}/${String(arbitratorChainId)}/${entry.proxy}/${String(disputeId)}`;
}

/**
 * Whether a value read back from the cache is the question of this entry: well formed, from the entry's Reality.eth
 * contract and chain, and the known question when the dispute is a known one (A5). Everything else is dropped.
 */
export function isValidCachedQuestion(value: unknown, entry: RealityProxyEntry, known: KnownDisputeQuestion | undefined): value is RealityQuestion {
  const schema = z.object({
    questionId: z
      .string()
      .regex(QUESTION_ID)
      .refine((questionId) => known === undefined || questionId.toLowerCase() === known.questionId.toLowerCase()),
    templateId: z.string().regex(DECIMAL_STRING),
    templateText: z.string(),
    questionText: z.string(),
    reality: z.literal(entry.reality),
    realityChainId: z.literal(entry.realityChainId),
  });
  return schema.safeParse(value).success;
}

/** The cached question when it is valid, else `undefined`; an invalid entry is removed. A cache that throws is no cache. */
export function readCachedQuestion(
  cache: RealityQuestionCache | undefined,
  key: string,
  entry: RealityProxyEntry,
  known: KnownDisputeQuestion | undefined,
): RealityQuestion | undefined {
  if (cache === undefined) return undefined;
  try {
    const cached = cache.get(key);
    if (cached === undefined || cached === null) return undefined;
    if (isValidCachedQuestion(cached, entry, known)) return cached;
    cache.remove(key);
  } catch {
    // Storage unavailable: the lookup goes on without it.
  }
  return undefined;
}

/** Caching is best-effort: a cache that throws is ignored. */
export function writeCachedQuestion(cache: RealityQuestionCache | undefined, key: string, question: RealityQuestion): void {
  try {
    cache?.set(key, question);
  } catch {
    // Storage unavailable or full: the question is simply looked up again next time.
  }
}
