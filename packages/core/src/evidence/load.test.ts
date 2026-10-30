import { describe, expect, it } from "vitest";
import { BodyTooLargeError } from "../fetch";
import type { Address, Fetcher, Hex } from "../types";
import type { EvidenceContext } from "./types";
import { loadEvidence } from "./index";
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

function syntheticContext(logs: readonly RpcLog[], bodies: Readonly<Record<string, string | Error>>, node: Partial<FakeNode> = {}) {
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

const NOTHING_HIDDEN = { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 };

describe("loadEvidence", () => {
  it("loads the five recorded entries of mainnet 505 newest first, each with its submitter, block, time, transaction, canonical URI and attachment, fetching only the evidence JSON through the gateway", async () => {
    const fake = fakeFetcher(recordedBodies());
    const { context } = recordedContext(DISPUTE_505, fake.fetcher);
    const outcome = await loadEvidence(context);
    if (!outcome.ok) throw new Error(outcome.error.message);
    const { items } = outcome.value;
    expect(items.map((item) => item.title)).toEqual([
      "quid-pro-quo against Gitcoin's tos",
      "Forbidden to offer reward?",
      '"Screenshot from the Twitter"',
      "Screenshot from Twitter",
      "Video Capture",
    ]);
    expect(items.map((item) => item.blockNumber)).toEqual([11426356n, 11414822n, 11414618n, 11406443n, 11405132n]);
    expect(outcome.value.hiddenEvidenceCount).toBe(0);
    expect(outcome.value.hiddenByReason).toEqual(NOTHING_HIDDEN);

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

  it("one block read per distinct block of the shown entries", async () => {
    const logs = [entry(`/ipfs/${CID_A}`, 10n, 0), entry(`/ipfs/${CID_A}`, 10n, 1), entry(`/ipfs/${CID_B}`, 20n, 0), entry("https://example.org/e.json", 30n, 0)];
    const body = JSON.stringify({ name: "n" });
    const { context, requests } = syntheticContext(logs, { [`${GATEWAY}/ipfs/${CID_A}`]: body, [`${GATEWAY}/ipfs/${CID_B}`]: body });
    const outcome = await loadEvidence(context);
    expect(outcome.ok && outcome.value.items).toHaveLength(3);
    expect([...requests.blocks].sort(byNumber)).toEqual([10n, 20n]);
  });

  it("entries with the same timestamp keep chain order", async () => {
    const logs = [entry(`/ipfs/${CID_A}`, 10n, 0), entry(`/ipfs/${CID_B}`, 10n, 3), entry(`/ipfs/${CID_A}/second`, 20n, 0)];
    const { context } = syntheticContext(logs, {
      [`${GATEWAY}/ipfs/${CID_A}`]: JSON.stringify({ name: "first" }),
      [`${GATEWAY}/ipfs/${CID_B}`]: JSON.stringify({ name: "same block, later log" }),
      [`${GATEWAY}/ipfs/${CID_A}/second`]: JSON.stringify({ name: "newest" }),
    });
    const outcome = await loadEvidence(context);
    expect(outcome.ok && outcome.value.items.map((item) => item.title)).toEqual(["newest", "first", "same block, later log"]);
  });

  it("http(s), /ipns/, dot-segment escapes and percent-encoded variants are hidden without a fetch", async () => {
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
    expect(outcome).toEqual({ ok: true, value: { items: [], hiddenEvidenceCount: uris.length, hiddenByReason: { ...NOTHING_HIDDEN, "not-content-addressed": uris.length } } });
    expect(urls).toEqual([]);
  });

  it("content-addressed spellings are fetched at their canonical gateway path", async () => {
    const logs = [entry(`ipfs://${CID_A}/e.json`, 10n), entry(CIDV1, 11n)];
    const body = JSON.stringify({ name: "n" });
    const { context, urls } = syntheticContext(logs, { [`${GATEWAY}/ipfs/${CID_A}/e.json`]: body, [`${GATEWAY}/ipfs/${CIDV1}`]: body });
    const outcome = await loadEvidence(context);
    expect(outcome.ok && outcome.value.items.map((item) => item.uri)).toEqual([`/ipfs/${CIDV1}`, `/ipfs/${CID_A}/e.json`]);
    expect(new Set(urls)).toEqual(new Set([`${GATEWAY}/ipfs/${CID_A}/e.json`, `${GATEWAY}/ipfs/${CIDV1}`]));
  });

  it("a failed or rejected fetch is hidden as fetch-failed", async () => {
    const logs = [entry(`/ipfs/${CID_A}`, 10n), entry(`/ipfs/${CID_B}`, 11n)];
    const { context } = syntheticContext(logs, { [`${GATEWAY}/ipfs/${CID_B}`]: new TypeError("network down") });
    const outcome = await loadEvidence(context);
    expect(outcome.ok && outcome.value).toEqual({ items: [], hiddenEvidenceCount: 2, hiddenByReason: { ...NOTHING_HIDDEN, "fetch-failed": 2 } });
  });

  it("a body over the fetch cap is hidden as fetch-failed, not as not-json", async () => {
    const { context } = syntheticContext([entry(`/ipfs/${CID_A}`, 10n), entry(`/ipfs/${CID_B}`, 11n)], {
      [`${GATEWAY}/ipfs/${CID_A}`]: JSON.stringify({ name: "read past the cap" }),
      [`${GATEWAY}/ipfs/${CID_B}`]: new BodyTooLargeError(1),
    });
    const base = context.fetcher;
    const fetcher: Fetcher = async (url, init) => {
      const response = await base(url, init);
      return url === `${GATEWAY}/ipfs/${CID_A}` ? { ...response, json: () => Promise.reject(new BodyTooLargeError(1)) } : response;
    };
    const outcome = await loadEvidence({ ...context, fetcher });
    expect(outcome.ok && outcome.value).toEqual({ items: [], hiddenEvidenceCount: 2, hiddenByReason: { ...NOTHING_HIDDEN, "fetch-failed": 2 } });
  });

  it("malformed evidence JSON is hidden as schema-invalid; valid entries still show", async () => {
    const malformed = [JSON.stringify([1, 2]), JSON.stringify({ title: { toString: "x" } })];
    const logs = [...malformed.map((_, index) => entry(`/ipfs/${CID_A}/${String(index)}`, 10n + BigInt(index))), entry(`/ipfs/${CID_B}`, 50n)];
    const bodies = Object.fromEntries([
      ...malformed.map((body, index): [string, string] => [`${GATEWAY}/ipfs/${CID_A}/${String(index)}`, body]),
      [`${GATEWAY}/ipfs/${CID_B}`, JSON.stringify({ title: "ok" })],
    ]);
    const { context } = syntheticContext(logs, bodies);
    const outcome = await loadEvidence(context);
    expect(outcome.ok && outcome.value).toEqual({
      items: [expect.objectContaining({ title: "ok" })],
      hiddenEvidenceCount: malformed.length,
      hiddenByReason: { ...NOTHING_HIDDEN, "schema-invalid": malformed.length },
    });
  });

  it("hiddenEvidenceCount is the sum of the hidden reasons", async () => {
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
    expect(outcome.ok && outcome.value).toEqual({
      items: [expect.objectContaining({ title: "shown" })],
      hiddenEvidenceCount: 4,
      hiddenByReason: { ...NOTHING_HIDDEN, "not-content-addressed": 1, "fetch-failed": 1, "not-json": 1, "schema-invalid": 1 },
    });
  });

  it("an Evidence log whose data does not decode is counted as undecodable, never dropped silently", async () => {
    const broken: RpcLog = { ...entry(`/ipfs/${CID_A}`, 10n), data: "0xdeadbeef" };
    const { context } = syntheticContext([broken, entry(`/ipfs/${CID_B}`, 11n)], { [`${GATEWAY}/ipfs/${CID_B}`]: JSON.stringify({ name: "shown" }) });
    const outcome = await loadEvidence(context);
    expect(outcome.ok && outcome.value.hiddenByReason).toEqual({ ...NOTHING_HIDDEN, undecodable: 1 });
    expect(outcome.ok && outcome.value.hiddenEvidenceCount).toBe(1);
    expect(outcome.ok && outcome.value.items).toHaveLength(1);
  });

  it("no Evidence logs give an empty list with nothing hidden", async () => {
    const { context } = syntheticContext([], {});
    expect(await loadEvidence(context)).toEqual({ ok: true, value: { items: [], hiddenEvidenceCount: 0, hiddenByReason: NOTHING_HIDDEN } });
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
    const seen: (AbortSignal | undefined)[] = [];
    const fetcher: Fetcher = (_url, init) => {
      seen.push(init?.signal);
      controller.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    };
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
    expect(outcome.ok && outcome.value.items).toHaveLength(count);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(8);
  });
});
