import { metaEvidenceCachePolicy, parseCachedMetaEvidenceResult, z } from "@dispute-resolver/core";
import { defaultShouldDehydrateQuery, hashKey, type DehydratedState, type Query, type QueryKey } from "@tanstack/react-query";
import type { PersistedClient, PersistQueryClientOptions, Persister } from "@tanstack/react-query-persist-client";
import { CACHE_VERSION, PERSIST_THROTTLE_MS, PERSISTED_CACHE_KEY, PERSISTED_CACHE_MAX_AGE_MS, PERSISTED_QUERY_GC_TIME_MS } from "./constants";

export interface PersistStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const BIGINT_TAG = "$bigint";
const decimalPattern = /^-?\d+$/;

const courtSchema = z.strictObject({
  id: z.bigint(),
  parent: z.bigint(),
  hiddenVotes: z.boolean(),
  timesPerPeriod: z.tuple([z.bigint(), z.bigint(), z.bigint(), z.bigint()]),
  policyUri: z.string().nullable(),
  name: z.string().nullable(),
});

/** Only an `ok` court list is ever persisted, so only that shape is accepted back. */
const courtsOutcomeSchema = z.strictObject({ ok: z.literal(true), value: z.array(courtSchema).readonly() });

const chainIdSchema = z.number().int().nonnegative();
const courtsKeySchema = z.tuple([z.literal("dr"), z.literal("courts"), chainIdSchema]);
const metaEvidenceKeySchema = z.tuple([z.literal("dr"), z.literal("metaEvidence"), chainIdSchema, z.string().regex(/^\d+$/), z.string().regex(/^0x[0-9a-f]{40}$/)]);

const persistedQuerySchema = z.looseObject({
  queryKey: z.array(z.unknown()),
  state: z.looseObject({ status: z.literal("success"), data: z.unknown(), dataUpdatedAt: z.number() }),
});

const persistedClientSchema = z.object({
  timestamp: z.number(),
  buster: z.string(),
  clientState: z.object({ queries: z.array(z.unknown()) }),
});

/**
 * An allowlist: an `ok` court list, and a meta-evidence result whose cache policy is `persist`. Everything else stays
 * in memory, notably bindings, which must come from the chain, and the keys of `@kleros/kleros-app` (`UserSettings`
 * holds the user's email).
 */
function persistableData(queryKey: QueryKey, data: unknown): unknown {
  if (courtsKeySchema.safeParse(queryKey).success) {
    const courts = courtsOutcomeSchema.safeParse(data);
    return courts.success ? courts.data : null;
  }
  if (metaEvidenceKeySchema.safeParse(queryKey).success) {
    const result = parseCachedMetaEvidenceResult(data);
    return result !== null && metaEvidenceCachePolicy(result) === "persist" ? result : null;
  }
  return null;
}

export function shouldPersistQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && persistableData(query.queryKey, query.state.data) !== null;
}

/** JSON with `bigint` written as `{"$bigint":"<decimal>"}`. */
export function serializePersistedClient(client: PersistedClient): string {
  return JSON.stringify(client, (_key, value: unknown) => (typeof value === "bigint" ? { [BIGINT_TAG]: value.toString() } : value));
}

function reviveBigint(_key: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const entries = Object.entries(value);
  if (entries.length !== 1) return value;
  const [tag, decimal] = entries[0] ?? [];
  return tag === BIGINT_TAG && typeof decimal === "string" && decimalPattern.test(decimal) ? BigInt(decimal) : value;
}

/** A client without a timestamp, which the restore discards (and removes from storage) without hydrating anything. */
const DISCARDED: PersistedClient = Object.freeze({ timestamp: 0, buster: "", clientState: { mutations: [], queries: [] } });

/**
 * One restored query re-validated for its key kind, or `null` (dropped, never repaired). Only the key, the data and
 * its update time are read back; the hash is recomputed from the key and the rest of the state is a fresh success.
 */
function restoredQuery(entry: unknown): DehydratedState["queries"][number] | null {
  const parsed = persistedQuerySchema.safeParse(entry);
  if (!parsed.success) return null;
  const { queryKey, state } = parsed.data;
  const data = persistableData(queryKey, state.data);
  if (data === null) return null;
  return {
    queryKey,
    queryHash: hashKey(queryKey),
    dehydratedAt: state.dataUpdatedAt,
    state: {
      data,
      dataUpdateCount: 1,
      dataUpdatedAt: state.dataUpdatedAt,
      error: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      fetchMeta: null,
      isInvalidated: false,
      status: "success",
      fetchStatus: "idle",
    },
  };
}

export function deserializePersistedClient(text: string): PersistedClient {
  let raw: unknown;
  try {
    raw = JSON.parse(text, reviveBigint);
  } catch {
    return DISCARDED;
  }
  const envelope = persistedClientSchema.safeParse(raw);
  if (!envelope.success) return DISCARDED;
  const queries = envelope.data.clientState.queries.map(restoredQuery).filter((query) => query !== null);
  return { timestamp: envelope.data.timestamp, buster: envelope.data.buster, clientState: { mutations: [], queries } };
}

/**
 * Written the way the deprecated `createSyncStoragePersister` implements it (that package is not a dependency), with
 * every storage call guarded. Writes are throttled and the latest client wins.
 */
export function createStoragePersister(storage: PersistStorage | undefined, throttleMs: number = PERSIST_THROTTLE_MS): Persister {
  let pending: PersistedClient | undefined;
  const save = (): void => {
    const client = pending;
    pending = undefined;
    if (client === undefined) return;
    try {
      storage?.setItem(PERSISTED_CACHE_KEY, serializePersistedClient(client));
    } catch {
      // A full or blocked storage keeps the previous blob; the queries stay cached in memory.
    }
  };
  return {
    persistClient(client) {
      const scheduled = pending !== undefined;
      pending = client;
      if (!scheduled) setTimeout(save, throttleMs);
    },
    restoreClient() {
      try {
        const text = storage?.getItem(PERSISTED_CACHE_KEY) ?? null;
        return text === null ? undefined : deserializePersistedClient(text);
      } catch {
        return undefined;
      }
    },
    removeClient() {
      try {
        storage?.removeItem(PERSISTED_CACHE_KEY);
      } catch {
        // Nothing else to do: a blob that cannot be removed is validated again, and discarded, on the next restore.
      }
    },
  };
}

/**
 * Restored entries get `PERSISTED_QUERY_GC_TIME_MS`: with TanStack's 5-minute default, an entry no screen observes in
 * the session that restores it would be collected and left out of the next blob, long before its maxAge.
 */
export function createPersistOptions(storage: PersistStorage | undefined, buster: string = CACHE_VERSION): Omit<PersistQueryClientOptions, "queryClient"> {
  return {
    persister: createStoragePersister(storage),
    buster,
    maxAge: PERSISTED_CACHE_MAX_AGE_MS,
    hydrateOptions: { defaultOptions: { queries: { gcTime: PERSISTED_QUERY_GC_TIME_MS } } },
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery, shouldDehydrateMutation: () => false },
  };
}
