import type { Court, MetaEvidenceResult, Outcome } from "@dispute-resolver/core";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage, testBinding, testCourt, testFamily, testFoundLookup, testOkMetaEvidence } from "../test/data";
import { CACHE_VERSION, PERSISTED_CACHE_KEY, PERSISTED_CACHE_MAX_AGE_MS } from "./constants";
import { createPersistOptions, createStoragePersister, deserializePersistedClient, shouldPersistQuery } from "./persistence";
import { queryKeys } from "./queryKeys";

const ARBITRABLE = testBinding().arbitrated;
const courtsOk: Outcome<readonly Court[]> = { ok: true, value: [testCourt(), testCourt({ id: 1n, name: null, hiddenVotes: true })] };
const metaEvidenceKey = queryKeys.metaEvidence(1, 5n, ARBITRABLE);
const invalidResult: MetaEvidenceResult = { status: "invalid", metaEvidence: testOkMetaEvidence().metaEvidence, reason: "uri-not-content-addressed" };
const failedResult: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "gateway down" } };

function persistedKeys(client: QueryClient): unknown[] {
  return dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }).queries.map((query) => query.queryKey);
}

async function persistAndRestore(source: QueryClient, writeBuster = CACHE_VERSION, readBuster = CACHE_VERSION): Promise<QueryClient> {
  const storage = createMemoryStorage();
  vi.useFakeTimers();
  await persistQueryClientSave({ queryClient: source, ...createPersistOptions(storage, writeBuster) });
  vi.runAllTimers();
  vi.useRealTimers();
  const target = new QueryClient();
  await persistQueryClientRestore({ queryClient: target, ...createPersistOptions(storage, readBuster) });
  return target;
}

/** A persisted blob as it sits in localStorage, built by hand so a test can corrupt one entry. */
function blob(queries: readonly { readonly queryKey: unknown; readonly data: unknown }[], buster = CACHE_VERSION): string {
  return JSON.stringify({
    buster,
    timestamp: Date.now(),
    clientState: {
      mutations: [],
      queries: queries.map(({ queryKey, data }) => ({
        queryKey,
        queryHash: JSON.stringify(queryKey),
        state: { status: "success", data: asStored(data), dataUpdatedAt: Date.now() },
      })),
    },
  });
}

/** Saves the client through the app's persist options and returns the query keys of the blob written to storage. */
async function writtenKeys(client: QueryClient, storage = createMemoryStorage()): Promise<unknown[]> {
  vi.useFakeTimers();
  await persistQueryClientSave({ queryClient: client, ...createPersistOptions(storage) });
  vi.runAllTimers();
  vi.useRealTimers();
  const written = JSON.parse(storage.entries.get(PERSISTED_CACHE_KEY) ?? "null") as { clientState: { queries: { queryKey: unknown }[] } } | null;
  return written?.clientState.queries.map((query) => query.queryKey) ?? [];
}

async function restoreBlob(text: string): Promise<QueryClient> {
  const storage = createMemoryStorage({ [PERSISTED_CACHE_KEY]: text });
  const client = new QueryClient();
  await persistQueryClientRestore({ queryClient: client, ...createPersistOptions(storage) });
  return client;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("persisted query cache (ARCHITECTURE.md §5.4)", () => {
  it("B15: an ok court list and an ok meta-evidence round-trip, bigints included", async () => {
    const source = new QueryClient();
    source.setQueryData(queryKeys.courts(1), courtsOk);
    source.setQueryData(metaEvidenceKey, testOkMetaEvidence());
    const restored = await persistAndRestore(source);
    expect(restored.getQueryData(queryKeys.courts(1))).toEqual(courtsOk);
    expect(restored.getQueryData(metaEvidenceKey)).toEqual(testOkMetaEvidence());
  });

  it("D-13: a version bump invalidates every entry", async () => {
    const source = new QueryClient();
    source.setQueryData(queryKeys.courts(1), courtsOk);
    source.setQueryData(metaEvidenceKey, testOkMetaEvidence());
    const restored = await persistAndRestore(source, "dr-cache-old", CACHE_VERSION);
    expect(restored.getQueryCache().getAll()).toHaveLength(0);
  });

  it("D-13: a version bump removes the old blob from storage", async () => {
    const storage = createMemoryStorage({ [PERSISTED_CACHE_KEY]: blob([{ queryKey: queryKeys.courts(1), data: { ok: true, value: [] } }], "dr-cache-old") });
    await persistQueryClientRestore({ queryClient: new QueryClient(), ...createPersistOptions(storage) });
    expect(storage.entries.has(PERSISTED_CACHE_KEY)).toBe(false);
  });

  it("A2: an invalid result is never written", () => {
    const client = new QueryClient();
    client.setQueryData(metaEvidenceKey, invalidResult);
    expect(persistedKeys(client)).toEqual([]);
  });

  it("D-38: a failed or missing meta-evidence stays in memory", () => {
    const client = new QueryClient();
    client.setQueryData(metaEvidenceKey, failedResult);
    client.setQueryData(queryKeys.metaEvidence(1, 6n, ARBITRABLE), { status: "missing" } satisfies MetaEvidenceResult);
    expect(persistedKeys(client)).toEqual([]);
  });

  it("D-13: a failed court list is never written", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.courts(1), { ok: false, error: { code: "rpc-error", message: "down" } } satisfies Outcome<readonly Court[]>);
    expect(persistedKeys(client)).toEqual([]);
  });

  it("A22: a lookup holding a binding is never written", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.lookup(1, 1n), testFoundLookup());
    expect(persistedKeys(client)).toEqual([]);
  });

  it("C11: family detections are never written", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.family(1, ARBITRABLE), testFamily());
    expect(persistedKeys(client)).toEqual([]);
  });

  it("§5.4: the library's UserSettings and RoleRestrictions queries are never written", () => {
    const client = new QueryClient();
    client.setQueryData(["UserSettings"], { email: "user@example.com" });
    client.setQueryData(["RoleRestrictions"], []);
    client.setQueryData(queryKeys.courts(1), courtsOk);
    expect(persistedKeys(client)).toEqual([queryKeys.courts(1)]);
  });

  it("DATA-3 / §5.4, A2, A22, C11: the persister writes only allowlisted entries to storage", async () => {
    const client = new QueryClient();
    client.setQueryData(["UserSettings"], { email: "user@example.com" });
    client.setQueryData(metaEvidenceKey, invalidResult);
    client.setQueryData(queryKeys.lookup(1, 1n), testFoundLookup());
    client.setQueryData(queryKeys.family(1, ARBITRABLE), testFamily());
    client.setQueryData(queryKeys.withdrawable(1, 5n, ARBITRABLE, [0n], undefined), { status: "nothing" });
    client.setQueryData(queryKeys.accountCode(1, ARBITRABLE), true);
    client.setQueryData(queryKeys.courts(1), courtsOk);
    expect(await writtenKeys(client)).toEqual([queryKeys.courts(1)]);
  });

  it("DATA-2 / §5.4: a restored entry survives the whole maxAge without an observer", async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage({ [PERSISTED_CACHE_KEY]: blob([{ queryKey: queryKeys.courts(1), data: courtsOk }]) });
    const client = new QueryClient();
    await persistQueryClientRestore({ queryClient: client, ...createPersistOptions(storage) });
    vi.advanceTimersByTime(PERSISTED_CACHE_MAX_AGE_MS - 1);
    vi.useRealTimers();
    expect(client.getQueryData(queryKeys.courts(1))).toEqual(courtsOk);
    expect(await writtenKeys(client, storage)).toEqual([queryKeys.courts(1)]);
  });

  it("B15: a malformed meta-evidence entry is ignored", async () => {
    const malformed = { ...testOkMetaEvidence(), metaEvidence: { ...testOkMetaEvidence().metaEvidence, title: { toString: "x" } } };
    const restored = await restoreBlob(
      blob([
        { queryKey: metaEvidenceKey, data: malformed },
        { queryKey: queryKeys.courts(1), data: asStored(courtsOk) },
      ]),
    );
    expect(restored.getQueryData(metaEvidenceKey)).toBeUndefined();
    expect(restored.getQueryData(queryKeys.courts(1))).toEqual(courtsOk);
  });

  it("B15: a meta-evidence entry that is not content-addressed is ignored", async () => {
    const restored = await restoreBlob(blob([{ queryKey: metaEvidenceKey, data: { ...testOkMetaEvidence(), uri: "/ipns/example.eth" } }]));
    expect(restored.getQueryData(metaEvidenceKey)).toBeUndefined();
  });

  it("B15: a court list with a number where a bigint belongs is ignored", async () => {
    const restored = await restoreBlob(blob([{ queryKey: queryKeys.courts(1), data: { ok: true, value: [{ ...testCourt(), id: 0 }] } }]));
    expect(restored.getQueryData(queryKeys.courts(1))).toBeUndefined();
  });

  it("A22: a restored entry under a key outside the allowlist is ignored", async () => {
    const restored = await restoreBlob(
      blob([
        { queryKey: queryKeys.lookup(1, 1n), data: { status: "found" } },
        { queryKey: ["UserSettings"], data: {} },
      ]),
    );
    expect(restored.getQueryCache().getAll()).toHaveLength(0);
  });

  it("B15: a blob that does not parse is discarded whole", async () => {
    const storage = createMemoryStorage({ [PERSISTED_CACHE_KEY]: "{not json" });
    const client = new QueryClient();
    await persistQueryClientRestore({ queryClient: client, ...createPersistOptions(storage) });
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(storage.entries.has(PERSISTED_CACHE_KEY)).toBe(false);
  });

  it("B15: a forged $bigint that is not a decimal stays an object and fails validation", () => {
    const text = blob([{ queryKey: queryKeys.courts(1), data: { ok: true, value: [{ ...testCourt(), id: { $bigint: "1e3" } }] } }]);
    expect(deserializePersistedClient(text).clientState.queries).toEqual([]);
  });

  it("§5.4: a storage that throws restores nothing and never reaches the app", async () => {
    const storage = createMemoryStorage();
    storage.failing = true;
    const client = new QueryClient();
    client.setQueryData(queryKeys.courts(1), courtsOk);
    vi.useFakeTimers();
    await persistQueryClientSave({ queryClient: client, ...createPersistOptions(storage) });
    expect(() => vi.runAllTimers()).not.toThrow();
    vi.useRealTimers();
    const target = new QueryClient();
    await persistQueryClientRestore({ queryClient: target, ...createPersistOptions(storage) });
    expect(target.getQueryCache().getAll()).toHaveLength(0);
  });

  it("§5.4: writes are throttled to one per second, keeping the latest state", async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    const persister = createStoragePersister(storage);
    const client = (buster: string) => ({ timestamp: 1, buster, clientState: { mutations: [], queries: [] } });
    await persister.persistClient(client("first"));
    await persister.persistClient(client("second"));
    vi.advanceTimersByTime(999);
    expect(storage.entries.size).toBe(0);
    vi.advanceTimersByTime(1);
    expect(JSON.parse(storage.entries.get(PERSISTED_CACHE_KEY) ?? "{}")).toMatchObject({ buster: "second" });
    vi.useRealTimers();
  });
});

/** A value as it sits in the persisted blob: bigints tagged as `{"$bigint":"<decimal>"}`. */
function asStored(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? { $bigint: item.toString() } : item)));
}
