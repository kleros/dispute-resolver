import type { Court, MetaEvidenceResult, Outcome } from "@dispute-resolver/core";
import { QueryClient, dehydrate, type QueryKey } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSave } from "@tanstack/react-query-persist-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage, testBinding, testCourt, testFamily, testFoundLookup, testOkMetaEvidence } from "../test/data";
import { CACHE_VERSION, PERSISTED_CACHE_KEY, PERSISTED_CACHE_MAX_AGE_MS } from "./constants";
import { createPersistOptions, createStoragePersister, deserializePersistedClient, serializePersistedClient, shouldPersistQuery } from "./persistence";
import { queryKeys } from "./queryKeys";

const ARBITRABLE = testBinding().arbitrated;
const courtsOk: Outcome<readonly Court[]> = { ok: true, value: [testCourt(), testCourt({ id: 1n, name: null, hiddenVotes: true })] };
const metaEvidenceKey = queryKeys.metaEvidence(1, 5n, ARBITRABLE);
const invalidResult: MetaEvidenceResult = { status: "invalid", metaEvidence: testOkMetaEvidence().metaEvidence, reason: "uri-not-content-addressed" };
const failedResult: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "gateway down" } };

async function persistAndRestore(source: QueryClient): Promise<QueryClient> {
  const storage = createMemoryStorage();
  vi.useFakeTimers();
  await persistQueryClientSave({ queryClient: source, ...createPersistOptions(storage) });
  vi.runAllTimers();
  vi.useRealTimers();
  const target = new QueryClient();
  await persistQueryClientRestore({ queryClient: target, ...createPersistOptions(storage) });
  return target;
}

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

/** Runs `body` while the global Function constructor counts every call and construction, and returns the count. */
function countFunctionConstructorUses(body: () => void): number {
  const original = globalThis.Function;
  let uses = 0;
  globalThis.Function = new Proxy(original, {
    apply(target, thisArgument, argumentList: unknown[]) {
      uses += 1;
      return Reflect.apply(target, thisArgument, argumentList) as unknown;
    },
    construct(target, argumentList: unknown[], newTarget: NewableFunction) {
      uses += 1;
      return Reflect.construct(target, argumentList, newTarget) as object;
    },
  });
  try {
    body();
  } finally {
    globalThis.Function = original;
  }
  return uses;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("persisted query cache", () => {
  it("restores the persisted cache without the Function constructor", () => {
    const source = new QueryClient();
    source.setQueryData(queryKeys.courts(1), courtsOk);
    source.setQueryData(metaEvidenceKey, testOkMetaEvidence());
    const client = { timestamp: Date.now(), buster: CACHE_VERSION, clientState: dehydrate(source, { shouldDehydrateQuery: shouldPersistQuery }) };
    let restoredQueries = 0;
    const uses = countFunctionConstructorUses(() => {
      restoredQueries = deserializePersistedClient(serializePersistedClient(client)).clientState.queries.length;
    });
    expect(restoredQueries).toBe(2);
    expect(uses).toBe(0);
  });

  it("round-trips an ok court list and an ok meta-evidence, bigints included", async () => {
    const source = new QueryClient();
    source.setQueryData(queryKeys.courts(1), courtsOk);
    source.setQueryData(metaEvidenceKey, testOkMetaEvidence());
    const restored = await persistAndRestore(source);
    expect(restored.getQueryData(queryKeys.courts(1))).toEqual(courtsOk);
    expect(restored.getQueryData(metaEvidenceKey)).toEqual(testOkMetaEvidence());
  });

  it("drops every entry after a version bump and removes the old blob from storage", async () => {
    const stored = blob(
      [
        { queryKey: queryKeys.courts(1), data: courtsOk },
        { queryKey: metaEvidenceKey, data: testOkMetaEvidence() },
      ],
      "dr-cache-old",
    );
    const storage = createMemoryStorage({ [PERSISTED_CACHE_KEY]: stored });
    const restored = new QueryClient();
    await persistQueryClientRestore({ queryClient: restored, ...createPersistOptions(storage) });
    expect(restored.getQueryCache().getAll()).toHaveLength(0);
    expect(storage.entries.has(PERSISTED_CACHE_KEY)).toBe(false);
  });

  it("restores a meta-evidence naming an unconfigured chain with its number", async () => {
    const unsupported = testOkMetaEvidence({ arbitrableChainID: { status: "unsupported", chainId: 10 } });
    const restored = await restoreBlob(blob([{ queryKey: metaEvidenceKey, data: unsupported }]));
    expect(restored.getQueryData(metaEvidenceKey)).toEqual(unsupported);
  });

  it.each<[string, readonly (readonly [QueryKey, unknown])[], readonly QueryKey[]]>([
    ["an invalid meta-evidence result", [[metaEvidenceKey, invalidResult]], []],
    [
      "a failed or missing meta-evidence",
      [
        [metaEvidenceKey, failedResult],
        [queryKeys.metaEvidence(1, 6n, ARBITRABLE), { status: "missing" } satisfies MetaEvidenceResult],
      ],
      [],
    ],
    ["a failed court list", [[queryKeys.courts(1), { ok: false, error: { code: "rpc-error", message: "down" } } satisfies Outcome<readonly Court[]>]], []],
    ["a lookup holding a binding", [[queryKeys.lookup(1, 1n), testFoundLookup()]], []],
    ["family detections", [[queryKeys.family(1, ARBITRABLE), testFamily()]], []],
    ["withdrawable amounts", [[queryKeys.withdrawable(1, 5n, ARBITRABLE, [0n], undefined), { status: "nothing" }]], []],
    ["an account's code", [[queryKeys.accountCode(1, ARBITRABLE), true]], []],
    ["the chain time", [[queryKeys.chainTime(1), { blockTimestamp: 1_700_000_000, observedAtMs: 1_700_000_000_000, observedAtMonotonicMs: 1_000 }]], []],
    [
      "the library's UserSettings and RoleRestrictions queries",
      [
        [["UserSettings"], { email: "user@example.com" }],
        [["RoleRestrictions"], []],
        [queryKeys.courts(1), courtsOk],
      ],
      [queryKeys.courts(1)],
    ],
  ])("never writes %s to storage", async (_name, entries, expected) => {
    const client = new QueryClient();
    for (const [key, data] of entries) client.setQueryData(key, data);
    expect(await writtenKeys(client)).toEqual(expected);
  });

  it("keeps a restored entry for the whole maxAge without an observer", async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage({ [PERSISTED_CACHE_KEY]: blob([{ queryKey: queryKeys.courts(1), data: courtsOk }]) });
    const client = new QueryClient();
    await persistQueryClientRestore({ queryClient: client, ...createPersistOptions(storage) });
    vi.advanceTimersByTime(PERSISTED_CACHE_MAX_AGE_MS - 1);
    vi.useRealTimers();
    expect(client.getQueryData(queryKeys.courts(1))).toEqual(courtsOk);
    expect(await writtenKeys(client, storage)).toEqual([queryKeys.courts(1)]);
  });

  it("ignores a malformed meta-evidence entry and keeps the valid ones", async () => {
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

  it.each<[string, QueryKey, unknown]>([
    ["meta-evidence entry that is not content-addressed", metaEvidenceKey, { ...testOkMetaEvidence(), uri: "/ipns/example.eth" }],
    ["court list with a number where a bigint belongs", queryKeys.courts(1), { ok: true, value: [{ ...testCourt(), id: 0 }] }],
    ["lookup entry, whose key is outside the allowlist", queryKeys.lookup(1, 1n), { status: "found" }],
    ["UserSettings entry, whose key is outside the allowlist", ["UserSettings"], {}],
    ["meta-evidence entry persisted without a source", metaEvidenceKey, { ...testOkMetaEvidence(), source: undefined }],
  ])("ignores a restored %s", async (_name, queryKey, data) => {
    const restored = await restoreBlob(blob([{ queryKey, data }]));
    expect(restored.getQueryCache().getAll()).toHaveLength(0);
  });

  it("discards a blob that does not parse whole", async () => {
    const storage = createMemoryStorage({ [PERSISTED_CACHE_KEY]: "{not json" });
    const client = new QueryClient();
    await persistQueryClientRestore({ queryClient: client, ...createPersistOptions(storage) });
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(storage.entries.has(PERSISTED_CACHE_KEY)).toBe(false);
  });

  it("leaves a forged $bigint that is not a decimal as an object that fails validation", () => {
    const text = blob([{ queryKey: queryKeys.courts(1), data: { ok: true, value: [{ ...testCourt(), id: { $bigint: "1e3" } }] } }]);
    expect(deserializePersistedClient(text).clientState.queries).toEqual([]);
  });

  it("restores nothing from a storage that throws, without the error reaching the app", async () => {
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

  it("throttles writes to one per second, keeping the latest state", async () => {
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

function asStored(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? { $bigint: item.toString() } : item)));
}
