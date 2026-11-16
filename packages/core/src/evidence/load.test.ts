import { describe, expect, it } from "vitest";
import { BodyTooLargeError } from "../fetch";
import type { Address, Fetcher, Hex } from "../types";
import type { Route } from "../test/fetch/testHelpers";
import type { EvidenceContext, EvidenceEntry, EvidenceItem, EvidenceList } from "./types";
import { loadEvidence, loadEvidenceEntry, loadEvidencePage } from "./index";
import { EVIDENCE_DOCUMENT_MAX_BYTES } from "./load";
import { EVIDENCE_PAGE_SIZE } from "./pages";
import { evidenceLog, fakeClient, fakeFetcher, recordedBodies, recordedDispute, recordedNode, RECORDED, rpcError, type FakeNode, type RpcLog } from "../test/evidence/testHelpers";

const ARBITRATOR = RECORDED.arbitrator;
const GATEWAY = RECORDED.gateway;
const DISPUTE_505 = recordedDispute(505n);

const ARBITRABLE: Address = "0x1111111111111111111111111111111111111111";
const PARTY: Address = "0x2222222222222222222222222222222222222222";
const GROUP = 9n;
const CID_A = "QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA";
const CID_B = "Qmb6BMHixyAjx1F36DT9SeoXBCn1ma1mGey84Fqq8zVncK";
const CIDV1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

function recordedContext(dispute: ReturnType<typeof recordedDispute>, fetcher: Fetcher, node: FakeNode = recordedNode()) {
  const { client, requests } = fakeClient(node);
  const context: EvidenceContext = {
    client,
    fetcher,
    gateway: GATEWAY,
    arbitrable: dispute.arbitrable,
    arbitrator: ARBITRATOR,
    evidenceGroupId: dispute.evidenceGroupId,
    fromBlock: RECORDED.scanFromBlock,
  };
  return { context, requests };
}

function entry(uri: string, block: bigint, logIndex = 0): RpcLog {
  return evidenceLog({ arbitrable: ARBITRABLE, arbitrator: ARBITRATOR, evidenceGroupId: GROUP, party: PARTY, uri, blockNumber: block, logIndex });
}

/** Block timestamps for synthetic logs: ten seconds per block, so a later block is always newer. */
function timestampsOf(logs: readonly RpcLog[]): Record<string, Hex> {
  return Object.fromEntries(logs.map((log) => [log.blockNumber, `0x${(BigInt(log.blockNumber) * 10n).toString(16)}`]));
}

function syntheticContext(logs: readonly RpcLog[], bodies: Readonly<Record<string, Route | readonly Route[]>>, node: Partial<FakeNode> = {}) {
  const { client, requests } = fakeClient({ head: 1_000n, logs, timestamps: timestampsOf(logs), ...node });
  const fake = fakeFetcher(bodies);
  const context: EvidenceContext = {
    client,
    fetcher: fake.fetcher,
    gateway: GATEWAY,
    arbitrable: ARBITRABLE,
    arbitrator: ARBITRATOR,
    evidenceGroupId: GROUP,
    fromBlock: 0n,
  };
  return { context, requests, urls: fake.urls, inits: fake.inits };
}

const byNumber = (a: bigint, b: bigint): number => Number(a - b);

/** A fetcher that aborts `controller` when asked for a document, and records the signal each request carried. */
function abortingFetcher(controller: AbortController) {
  const seen: (AbortSignal | undefined)[] = [];
  const fetcher: Fetcher = (_url, init) => {
    seen.push(init?.signal);
    controller.abort();
    return Promise.reject(new DOMException("aborted", "AbortError"));
  };
  return { fetcher, seen };
}

/** The shown entries' items, in the loaded page's order. */
function shown(list: EvidenceList): EvidenceItem[] {
  return list.entries.flatMap((entry) => (entry.status === "shown" ? [entry.item] : []));
}

function loaded(outcome: Awaited<ReturnType<typeof loadEvidence>>): EvidenceList {
  if (!outcome.ok) throw new Error(outcome.error.message);
  return outcome.value;
}

/** The loaded page's rows in its order: a shown entry by its title, any other by its status. */
function rows(list: EvidenceList): string[] {
  return list.entries.map((entry) => (entry.status === "shown" ? entry.item.title : entry.status));
}

describe("loadEvidence", () => {
  it("loads the five recorded entries of mainnet 505 newest first, each with its submitter, block, time, transaction, canonical URI and attachment, fetching only the evidence JSON through the gateway", async () => {
    const fake = fakeFetcher(recordedBodies());
    const { context } = recordedContext(DISPUTE_505, fake.fetcher);
    const outcome = await loadEvidence(context);
    if (!outcome.ok) throw new Error(outcome.error.message);
    const items = shown(outcome.value);
    expect(items.map((item) => item.title)).toEqual([
      "quid-pro-quo against Gitcoin's tos",
      "Forbidden to offer reward?",
      '"Screenshot from the Twitter"',
      "Screenshot from Twitter",
      "Video Capture",
    ]);
    expect(items.map((item) => item.blockNumber)).toEqual([11426356n, 11414822n, 11414618n, 11406443n, 11405132n]);
    expect(outcome.value.entries).toHaveLength(5);

    const log = DISPUTE_505.evidenceLogs[4];
    if (log === undefined) throw new Error("fixture has no fifth evidence log");
    expect(items[0]).toEqual({
      title: "quid-pro-quo against Gitcoin's tos",
      description: "ok my bad found it: https://gitcoin.co/wiki/grants/",
      submitter: "0xf86e2f89daaa7cbab4160c2245038ce21a993fde",
      timestamp: Number(DISPUTE_505.timestamps[log.blockNumber]),
      blockNumber: 11426356n,
      transactionHash: log.transactionHash,
      uri: "/ipfs/QmV4SvMwbnUT45uehgq7L2VFEy6P5JLsuKGssVnzDm7CBo/evidence.json",
      attachment: {
        kind: "link",
        href: `${GATEWAY}/ipfs/QmfX3DGJenwRUGfYVAWVNyrHk5WSv7MYk2CYs86p3d5L1Q/firefox_dwZdaleN4z.png`,
        label: "firefox_dwZdaleN4z.png",
        attachmentKind: "image",
      },
    });
    expect(items[1]?.attachment).toBeNull();

    expect(fake.urls).toHaveLength(5);
    expect(new Set(fake.urls)).toEqual(new Set(Object.keys(DISPUTE_505.documents).map((uri) => `${GATEWAY}${uri}`)));
  });

  it("one block read per distinct block of the page's entries, those whose document is not shown included", async () => {
    const logs = [entry(`/ipfs/${CID_A}`, 10n, 0), entry(`/ipfs/${CID_A}`, 10n, 1), entry(`/ipfs/${CID_B}`, 20n, 0), entry("https://example.org/e.json", 30n, 0)];
    const body = JSON.stringify({ name: "n" });
    const { context, requests } = syntheticContext(logs, { [`${GATEWAY}/ipfs/${CID_A}`]: body, [`${GATEWAY}/ipfs/${CID_B}`]: body });
    const outcome = await loadEvidence(context);
    expect(shown(loaded(outcome))).toHaveLength(3);
    expect([...requests.blocks].sort(byNumber)).toEqual([10n, 20n, 30n]);
  });

  it("entries with the same timestamp keep chain order", async () => {
    const logs = [entry(`/ipfs/${CID_A}`, 10n, 0), entry(`/ipfs/${CID_B}`, 10n, 3), entry(`/ipfs/${CID_A}/second`, 20n, 0)];
    const { context } = syntheticContext(logs, {
      [`${GATEWAY}/ipfs/${CID_A}`]: JSON.stringify({ name: "first" }),
      [`${GATEWAY}/ipfs/${CID_B}`]: JSON.stringify({ name: "same block, later log" }),
      [`${GATEWAY}/ipfs/${CID_A}/second`]: JSON.stringify({ name: "newest" }),
    });
    const outcome = await loadEvidence(context);
    expect(shown(loaded(outcome)).map((item) => item.title)).toEqual(["newest", "first", "same block, later log"]);
  });

  it("http(s), /ipns/, dot-segment escapes and percent-encoded variants are never fetched, and each keeps its row with who, when and the address as written", async () => {
    const uris = [
      `https://ipfs.kleros.io/ipfs/${CID_A}`,
      "http://example.org/evidence.json",
      `/ipns/${CID_A}`,
      `/ipfs/${CID_A}/../../ipns/x`,
      `/ipfs/${CID_A}/%2e%2e/%2e%2e/ipns/x`,
      `/ipfs/${CID_A}\\..\\..\\ipns\\x`,
      "",
      "not a uri",
    ];
    const { context, urls } = syntheticContext(
      uris.map((uri, index) => entry(uri, 10n + BigInt(index))),
      {},
    );
    const outcome = await loadEvidence(context);
    expect(loaded(outcome).entries).toEqual(
      uris
        .map((uri, index) => {
          const block = 10n + BigInt(index);
          return { blockNumber: block, logIndex: 0, status: "not-content-addressed", evidence: { submitter: PARTY, timestamp: Number(block * 10n), address: uri } };
        })
        .reverse(),
    );
    expect(urls).toEqual([]);
  });

  it("content-addressed spellings are fetched at their canonical gateway path", async () => {
    const logs = [entry(`ipfs://${CID_A}/e.json`, 10n), entry(CIDV1, 11n)];
    const body = JSON.stringify({ name: "n" });
    const { context, urls } = syntheticContext(logs, { [`${GATEWAY}/ipfs/${CID_A}/e.json`]: body, [`${GATEWAY}/ipfs/${CIDV1}`]: body });
    const outcome = await loadEvidence(context);
    expect(shown(loaded(outcome)).map((item) => item.uri)).toEqual([`/ipfs/${CIDV1}`, `/ipfs/${CID_A}/e.json`]);
    expect(new Set(urls)).toEqual(new Set([`${GATEWAY}/ipfs/${CID_A}/e.json`, `${GATEWAY}/ipfs/${CIDV1}`]));
  });

  it("a failed or rejected fetch keeps its row as fetch-failed, with who, when and where the file is", async () => {
    const logs = [entry(`/ipfs/${CID_A}`, 10n), entry(`/ipfs/${CID_B}`, 11n)];
    const { context } = syntheticContext(logs, { [`${GATEWAY}/ipfs/${CID_B}`]: new TypeError("network down") });
    const outcome = await loadEvidence(context);
    expect(loaded(outcome).entries).toEqual([
      { blockNumber: 11n, logIndex: 0, status: "fetch-failed", evidence: { submitter: PARTY, timestamp: 110, uri: `/ipfs/${CID_B}` } },
      { blockNumber: 10n, logIndex: 0, status: "fetch-failed", evidence: { submitter: PARTY, timestamp: 100, uri: `/ipfs/${CID_A}` } },
    ]);
  });

  it("a document over the cap, refused before or while its body is read, keeps its place as too large with who, when and where it is", async () => {
    const { context } = syntheticContext([entry(`/ipfs/${CID_A}`, 10n), entry(`/ipfs/${CID_B}`, 11n)], {
      [`${GATEWAY}/ipfs/${CID_A}`]: JSON.stringify({ name: "read past the cap" }),
      [`${GATEWAY}/ipfs/${CID_B}`]: new BodyTooLargeError(1),
    });
    const base = context.fetcher;
    const fetcher: Fetcher = async (url, init) => {
      const response = await base(url, init);
      return url === `${GATEWAY}/ipfs/${CID_A}` ? { ...response, json: () => Promise.reject(new BodyTooLargeError(1)) } : response;
    };
    const list = loaded(await loadEvidence({ ...context, fetcher }));
    expect(list.entries).toEqual([
      { blockNumber: 11n, logIndex: 0, status: "too-large", evidence: { submitter: PARTY, timestamp: 110, uri: `/ipfs/${CID_B}` } },
      { blockNumber: 10n, logIndex: 0, status: "too-large", evidence: { submitter: PARTY, timestamp: 100, uri: `/ipfs/${CID_A}` } },
    ]);
  });

  it("a refusal for a cap above 64 KB, the fetcher's own cap on a failed gateway answer, is fetch-failed, not too large", async () => {
    const { context } = syntheticContext([entry(`/ipfs/${CID_A}`, 10n)], { [`${GATEWAY}/ipfs/${CID_A}`]: new BodyTooLargeError(4_194_304) });
    const list = loaded(await loadEvidence(context));
    expect(list.entries).toEqual([{ blockNumber: 10n, logIndex: 0, status: "fetch-failed", evidence: { submitter: PARTY, timestamp: 100, uri: `/ipfs/${CID_A}` } }]);
  });

  it("asks the fetcher to stop reading each evidence document at 64 KB", async () => {
    const { context, inits } = syntheticContext([entry(`/ipfs/${CID_A}`, 10n)], { [`${GATEWAY}/ipfs/${CID_A}`]: JSON.stringify({ name: "n" }) });
    await loadEvidence(context);
    expect(EVIDENCE_DOCUMENT_MAX_BYTES).toBe(65_536);
    expect(inits).toEqual([{ maxBytes: 65_536 }]);
  });

  it("an evidence document submitted twice is fetched once and both entries are shown", async () => {
    const logs = [entry(`/ipfs/${CID_A}`, 10n, 0), entry(`ipfs://${CID_A}`, 12n, 3), entry(`/ipfs/${CID_B}`, 14n, 0)];
    const { context, urls } = syntheticContext(logs, {
      [`${GATEWAY}/ipfs/${CID_A}`]: JSON.stringify({ name: "twice" }),
      [`${GATEWAY}/ipfs/${CID_B}`]: JSON.stringify({ name: "once" }),
    });
    const list = loaded(await loadEvidence(context));
    expect(shown(list).map((item) => [item.title, item.blockNumber])).toEqual([
      ["once", 14n],
      ["twice", 12n],
      ["twice", 10n],
    ]);
    expect(urls).toHaveLength(2);
    expect(new Set(urls)).toEqual(new Set([`${GATEWAY}/ipfs/${CID_A}`, `${GATEWAY}/ipfs/${CID_B}`]));
  });

  it("malformed evidence JSON keeps its row as schema-invalid; valid entries still show", async () => {
    const malformed = [JSON.stringify([1, 2]), JSON.stringify({ title: { toString: "x" } })];
    const logs = [...malformed.map((_, index) => entry(`/ipfs/${CID_A}/${String(index)}`, 10n + BigInt(index))), entry(`/ipfs/${CID_B}`, 50n)];
    const bodies = Object.fromEntries([
      ...malformed.map((body, index): [string, string] => [`${GATEWAY}/ipfs/${CID_A}/${String(index)}`, body]),
      [`${GATEWAY}/ipfs/${CID_B}`, JSON.stringify({ title: "ok" })],
    ]);
    const { context } = syntheticContext(logs, bodies);
    const outcome = await loadEvidence(context);
    expect(rows(loaded(outcome))).toEqual(["ok", "schema-invalid", "schema-invalid"]);
    expect(loaded(outcome).entries[1]).toEqual({
      blockNumber: 11n,
      logIndex: 0,
      status: "schema-invalid",
      evidence: { submitter: PARTY, timestamp: 110, uri: `/ipfs/${CID_A}/1` },
    });
  });

  it("every log of the page keeps its row in its chain place, whatever its document gave", async () => {
    const logs = [
      entry("https://example.org/e.json", 10n),
      entry(`/ipfs/${CID_A}/missing`, 11n),
      entry(`/ipfs/${CID_A}/pdf`, 12n),
      entry(`/ipfs/${CID_A}/array`, 13n),
      entry(`/ipfs/${CID_B}`, 14n),
    ];
    const { context } = syntheticContext(logs, {
      [`${GATEWAY}/ipfs/${CID_A}/pdf`]: "%PDF",
      [`${GATEWAY}/ipfs/${CID_A}/array`]: "[]",
      [`${GATEWAY}/ipfs/${CID_B}`]: JSON.stringify({ name: "shown" }),
    });
    const outcome = await loadEvidence(context);
    expect(rows(loaded(outcome))).toEqual(["shown", "schema-invalid", "not-json", "fetch-failed", "not-content-addressed"]);
    const oldest = loaded(await loadEvidencePage(context, loaded(outcome).logs, { order: "oldest", page: 1 }));
    expect(rows(oldest)).toEqual(["not-content-addressed", "fetch-failed", "not-json", "schema-invalid", "shown"]);
  });

  it("an Evidence log whose data does not decode keeps its row as undecodable, with the submitter its topic names and its block's time", async () => {
    const broken: RpcLog = { ...entry(`/ipfs/${CID_A}`, 10n), data: "0xdeadbeef" };
    const { context, urls } = syntheticContext([broken, entry(`/ipfs/${CID_B}`, 11n)], { [`${GATEWAY}/ipfs/${CID_B}`]: JSON.stringify({ name: "shown" }) });
    const list = loaded(await loadEvidence(context));
    expect(list.entries[1]).toEqual({ blockNumber: 10n, logIndex: 0, status: "undecodable", evidence: { submitter: PARTY, timestamp: 100 } });
    expect(rows(list)).toEqual(["shown", "undecodable"]);
    expect(urls).toEqual([`${GATEWAY}/ipfs/${CID_B}`]);
  });

  it("no Evidence logs give an empty list", async () => {
    const { context } = syntheticContext([], {});
    expect(await loadEvidence(context)).toEqual({ ok: true, value: { logs: [], page: { order: "newest", page: 1 }, entries: [] } });
  });

  it.each<[string, Partial<FakeNode>, Record<string, string>]>([
    ["log scan", { failing: { eth_getLogs: rpcError(-32000, "down") } }, {}],
    ["block read", { timestamps: {} }, { [`${GATEWAY}/ipfs/${CID_A}`]: JSON.stringify({ name: "n" }) }],
  ])("a failed %s degrades to rpc-error instead of rejecting", async (_read, node, bodies) => {
    const { context } = syntheticContext([entry(`/ipfs/${CID_A}`, 10n)], bodies, node);
    const outcome = await loadEvidence(context);
    expect(!outcome.ok && outcome.error.code).toBe("rpc-error");
  });

  it("an aborted load degrades to rpc-error instead of rejecting, and the signal reaches the fetcher", async () => {
    const controller = new AbortController();
    const { context } = syntheticContext([entry(`/ipfs/${CID_A}`, 10n)], {});
    const { fetcher, seen } = abortingFetcher(controller);
    const outcome = await loadEvidence({ ...context, fetcher, signal: controller.signal });
    expect(seen).toEqual([controller.signal]);
    expect(!outcome.ok && outcome.error.code).toBe("rpc-error");
  });

  it("evidence fetches run with bounded concurrency", async () => {
    const count = 40;
    const logs = Array.from({ length: count }, (_, index) => entry(`/ipfs/${CID_A}/${String(index)}`, 10n + BigInt(index)));
    const { context } = syntheticContext(logs, {});
    let inFlight = 0;
    let peak = 0;
    const fetcher: Fetcher = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return { ok: true, status: 200, json: () => Promise.resolve({ name: "n" }), text: () => Promise.resolve("") };
    };
    const outcome = await loadEvidence({ ...context, fetcher });
    expect(shown(loaded(outcome))).toHaveLength(count);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
  });
});

describe("evidence pages", () => {
  const COUNT = EVIDENCE_PAGE_SIZE * 2 + 20;
  const uriOf = (index: number) => `/ipfs/${CID_A}/${String(index)}`;
  /** One entry per block from block 10, oldest first; each document's title is its position in chain order. */
  const pagedLogs = Array.from({ length: COUNT }, (_, index) => entry(uriOf(index), 10n + BigInt(index)));
  const pagedBodies = Object.fromEntries(pagedLogs.map((_, index) => [`${GATEWAY}${uriOf(index)}`, JSON.stringify({ name: String(index) })]));
  const positions = (from: number, to: number) => Array.from({ length: to - from }, (_, offset) => String(from + offset));

  it("the first load reads every Evidence log but only the newest page's documents and blocks", async () => {
    const { context, urls, requests } = syntheticContext(pagedLogs, pagedBodies);
    const list = loaded(await loadEvidence(context));
    expect(list.logs).toHaveLength(COUNT);
    expect(list.page).toEqual({ order: "newest", page: 1 });
    expect(shown(list).map((item) => item.title)).toEqual(positions(COUNT - EVIDENCE_PAGE_SIZE, COUNT).reverse());
    expect(urls).toHaveLength(EVIDENCE_PAGE_SIZE);
    expect(new Set(requests.blocks)).toEqual(new Set(pagedLogs.slice(COUNT - EVIDENCE_PAGE_SIZE).map((log) => BigInt(log.blockNumber))));
  });

  it("a load asked for another page reads only that page's documents", async () => {
    const { context, urls } = syntheticContext(pagedLogs, pagedBodies);
    const list = loaded(await loadEvidence({ ...context, page: { order: "oldest", page: 3 } }));
    expect(list.page).toEqual({ order: "oldest", page: 3 });
    expect(shown(list).map((item) => item.title)).toEqual(positions(EVIDENCE_PAGE_SIZE * 2, COUNT));
    expect(urls.map((url) => url.slice(url.lastIndexOf("/") + 1))).toEqual(positions(EVIDENCE_PAGE_SIZE * 2, COUNT));
  });

  it("opening another page reads its documents without reading the Evidence logs again, and keeps none of the previous page", async () => {
    const { context, urls, requests } = syntheticContext(pagedLogs, pagedBodies);
    const first = loaded(await loadEvidence(context));
    const logReads = requests.logs.length;
    urls.length = 0;

    const second = loaded(await loadEvidencePage(context, first.logs, { order: "newest", page: 2 }));
    expect(requests.logs).toHaveLength(logReads);
    expect(second.logs).toBe(first.logs);
    expect(second.page).toEqual({ order: "newest", page: 2 });
    expect(shown(second).map((item) => item.title)).toEqual(positions(COUNT - EVIDENCE_PAGE_SIZE * 2, COUNT - EVIDENCE_PAGE_SIZE).reverse());
    expect(second.entries).toHaveLength(EVIDENCE_PAGE_SIZE);
    expect(urls).toHaveLength(EVIDENCE_PAGE_SIZE);
  });

  it("an entry whose document is not shown keeps its row on its own page only", async () => {
    const broken: RpcLog = { ...entry(`/ipfs/${CID_B}`, 5n), data: "0xdeadbeef" };
    const logs = [broken, entry("https://example.org/e.json", 6n), ...pagedLogs];
    const { context } = syntheticContext(logs, pagedBodies);
    const newest = loaded(await loadEvidence(context));
    expect(newest.entries.every((entry) => entry.status === "shown")).toBe(true);

    const oldest = loaded(await loadEvidencePage(context, newest.logs, { order: "oldest", page: 1 }));
    expect(rows(oldest).slice(0, 3)).toEqual(["undecodable", "not-content-addressed", "0"]);
    expect(oldest.entries).toHaveLength(EVIDENCE_PAGE_SIZE);
    expect(shown(oldest)).toHaveLength(EVIDENCE_PAGE_SIZE - 2);
  });

  it("a failed block read or an abort while opening a page degrades to rpc-error", async () => {
    const { context } = syntheticContext(pagedLogs, pagedBodies);
    const first = loaded(await loadEvidence(context));
    const { client } = fakeClient({ head: 1_000n, logs: pagedLogs, timestamps: {} });
    const failed = await loadEvidencePage({ ...context, client }, first.logs, { order: "newest", page: 2 });
    expect(!failed.ok && failed.error.code).toBe("rpc-error");

    const controller = new AbortController();
    controller.abort();
    const aborted = await loadEvidencePage({ ...context, signal: controller.signal }, first.logs, { order: "newest", page: 2 });
    expect(!aborted.ok && aborted.error.code).toBe("rpc-error");
  });
});

describe("reading one entry again", () => {
  const FAILED_URI = `/ipfs/${CID_A}/failed`;
  const FAILED_URL = `${GATEWAY}${FAILED_URI}`;

  /** A page of three entries whose middle document did not load; the gateway answers it with `again` afterwards. */
  async function pageWithFailure(again: Route) {
    const logs = [entry(`/ipfs/${CID_A}/0`, 10n), entry(FAILED_URI, 11n), entry(`/ipfs/${CID_A}/2`, 12n)];
    const reads = syntheticContext(logs, {
      [`${GATEWAY}/ipfs/${CID_A}/0`]: JSON.stringify({ name: "zero" }),
      [FAILED_URL]: [new TypeError("network down"), again],
      [`${GATEWAY}/ipfs/${CID_A}/2`]: JSON.stringify({ name: "two" }),
    });
    const list = loaded(await loadEvidence(reads.context));
    const failed = list.entries[1];
    const log = list.logs[1];
    if (failed?.status !== "fetch-failed" || log === undefined) throw new Error("The middle entry should have failed to load.");
    reads.urls.length = 0;
    reads.inits.length = 0;
    return { ...reads, failed, log };
  }

  it("fetches only that entry's document, at its gateway path with the 64 KB cap, and reads no block", async () => {
    const { context, failed, log, urls, inits, requests } = await pageWithFailure(JSON.stringify({ name: "now shown" }));
    const blockReads = requests.blocks.length;
    await loadEvidenceEntry(context, log, failed.evidence.timestamp);
    expect(urls).toEqual([FAILED_URL]);
    expect(inits).toEqual([{ maxBytes: 65_536 }]);
    expect(requests.blocks).toHaveLength(blockReads);
  });

  it("a document that loads now becomes a normal entry with the log's submitter, block, time and transaction", async () => {
    const { context, failed, log } = await pageWithFailure(JSON.stringify({ title: "now shown", description: "text" }));
    expect(await loadEvidenceEntry(context, log, failed.evidence.timestamp)).toEqual({
      blockNumber: 11n,
      logIndex: 0,
      status: "shown",
      item: {
        title: "now shown",
        description: "text",
        submitter: PARTY,
        timestamp: 110,
        blockNumber: 11n,
        transactionHash: log.transactionHash,
        uri: FAILED_URI,
        attachment: null,
      },
    });
  });

  it.each<[string, Route, EvidenceEntry["status"]]>([
    ["too large", new BodyTooLargeError(65_536), "too-large"],
    ["not JSON", "%PDF-1.4", "not-json"],
    ["JSON that is not an evidence document", "[1, 2]", "schema-invalid"],
    ["still failing", new TypeError("network down"), "fetch-failed"],
  ])("a document that is now %s gives that entry, with who, when and where the file is", async (_now, again, status) => {
    const { context, failed, log } = await pageWithFailure(again);
    expect(await loadEvidenceEntry(context, log, failed.evidence.timestamp)).toEqual({
      blockNumber: 11n,
      logIndex: 0,
      status,
      evidence: { submitter: PARTY, timestamp: 110, uri: FAILED_URI },
    });
  });

  it("a log whose URI is not content-addressed, or whose data does not decode, gives the entry its page gave and is never fetched", async () => {
    const broken: RpcLog = { ...entry(`/ipfs/${CID_A}`, 10n), data: "0xdeadbeef" };
    const logs = [broken, entry("https://example.org/evidence.json", 11n), entry(`/ipfs/${CID_A}/../../ipns/x`, 12n)];
    const { context, urls } = syntheticContext(logs, {});
    const list = loaded(await loadEvidencePage(context, loaded(await loadEvidence(context)).logs, { order: "oldest", page: 1 }));
    expect(list.entries.map((entry) => entry.status)).toEqual(["undecodable", "not-content-addressed", "not-content-addressed"]);
    const again = await Promise.all(list.logs.map((log) => loadEvidenceEntry(context, log, Number(log.blockNumber * 10n))));
    expect(again).toEqual(list.entries);
    expect(urls).toEqual([]);
  });

  it("an aborted read never rejects: the signal reaches the fetcher and the entry stays fetch-failed", async () => {
    const { context, failed, log } = await pageWithFailure(JSON.stringify({ name: "now shown" }));
    const controller = new AbortController();
    const { fetcher, seen } = abortingFetcher(controller);
    const again = await loadEvidenceEntry({ ...context, fetcher, signal: controller.signal }, log, failed.evidence.timestamp);
    expect(seen).toEqual([controller.signal]);
    expect(again).toEqual(failed);
  });
});
