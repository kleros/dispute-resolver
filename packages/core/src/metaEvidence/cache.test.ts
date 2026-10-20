import { describe, expect, it } from "vitest";
import { realityQuestionCacheKey } from "../reality";
import { REGISTRY, getRealityProxy } from "../registry";
import { INVALID_META_EVIDENCE, loadMetaEvidence, metaEvidenceCachePolicy, parseCachedMetaEvidenceResult } from "./index";
import { CROSS_CHAIN_PROXY, META_CID, META_URL, boolQuestion, context, fakeFetcher, json, realityCache, servedMetaEvidence } from "../test/metaEvidence/testHelpers";
import type { MetaEvidenceResult, MetaEvidenceSource } from "./types";

/** What the persisted query cache stores and reads back: a JSON round trip. */
function persisted(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

async function okResult(): Promise<Extract<MetaEvidenceResult, { status: "ok" }>> {
  const entry = getRealityProxy(REGISTRY, 1, CROSS_CHAIN_PROXY);
  if (entry === undefined) throw new Error("the proxy must be registered");
  const cache = realityCache({ [realityQuestionCacheKey(1, entry, 1684n)]: boolQuestion("Will it rain?") });
  const { fetcher } = fakeFetcher(
    servedMetaEvidence(
      json({
        title: "Reality question",
        description: "Description",
        aliases: { "0x799CB978dEa5d6cA00cCB1794D3c3D4c89e40cD1": "Alice" },
        arbitrableChainID: 100,
        outcomes: ["No", "Yes"],
        _v: "1",
      }),
    ),
  );
  const result = await loadMetaEvidence(context({ fetcher, arbitrable: CROSS_CHAIN_PROXY, realityCache: cache }));
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result;
}

describe("metaEvidenceCachePolicy", () => {
  it("D-13: an accepted meta-evidence is persisted", async () => {
    expect(metaEvidenceCachePolicy(await okResult())).toBe("persist");
  });

  it("A2: a rejection is never cached", () => {
    for (const reason of ["uri-not-content-addressed", "script-uri-not-content-addressed", "script-not-allowlisted"] as const) {
      expect(metaEvidenceCachePolicy({ status: "invalid", metaEvidence: INVALID_META_EVIDENCE, reason })).toBe("never");
    }
  });

  it("D-38: failures and missing meta-evidence are cached briefly in memory only", () => {
    expect(metaEvidenceCachePolicy({ status: "missing" })).toBe("memory-brief");
    expect(metaEvidenceCachePolicy({ status: "failed", reason: "budget-exhausted", error: { code: "rpc-error", message: "x" } })).toBe("memory-brief");
  });
});

describe("parseCachedMetaEvidenceResult", () => {
  it("B15: a persisted accepted result reads back equal", async () => {
    const result = await okResult();
    expect(parseCachedMetaEvidenceResult(persisted(result))).toEqual(result);
  });

  it("B15: an accepted result without ruling options or Reality status reads back equal", async () => {
    const { fetcher } = fakeFetcher(servedMetaEvidence(json({ description: "Only a description" })));
    const result = await loadMetaEvidence(context({ fetcher }));
    expect(result.status).toBe("ok");
    expect(parseCachedMetaEvidenceResult(persisted(result))).toEqual(result);
  });

  it("P-25, B15: an accepted result with its source reads back equal", async () => {
    const base = await okResult();
    const sources: MetaEvidenceSource[] = [
      { kind: "event", locator: "disagrees", locatorPath: `/ipfs/${META_CID}` },
      { kind: "event", locator: "unavailable", locatorPath: null },
      { kind: "locator", event: "not-read" },
      { kind: "locator", event: "dispute-event-ambiguous" },
    ];
    for (const source of sources) {
      const result = { ...base, source };
      expect(parseCachedMetaEvidenceResult(persisted(result))).toEqual(result);
    }
  });

  it("P-25, B15: a persisted entry without a source is ignored", async () => {
    const good = persisted(await okResult()) as Record<string, unknown>;
    const { source, ...withoutSource } = good;
    expect(source).toEqual({ kind: "locator", event: "not-read" });
    expect(parseCachedMetaEvidenceResult(withoutSource)).toBeNull();
    const malformed: unknown[] = [
      { kind: "event", locator: "trust-me", locatorPath: null },
      { kind: "event", locator: "agrees", locatorPath: "/ipns/kleros.eth" },
      { kind: "event", locator: "agrees" },
      { kind: "locator", event: "found" },
      { kind: "chain" },
      null,
    ];
    for (const variant of malformed) expect(parseCachedMetaEvidenceResult({ ...good, source: variant })).toBeNull();
  });

  it("ME-2 B15 §9.2: an accepted result with descriptions by reserved answer code reads back equal", async () => {
    const tooSoon = `0x${"f".repeat(64)}`;
    const rulingOptions = {
      type: "single-select",
      titles: ["No", "Yes"],
      reserved: { [tooSoon]: "Answered Too Soon" },
      descriptions: { "0": "Not paid", [tooSoon]: "The observation period has not ended" },
    };
    const { fetcher } = fakeFetcher(servedMetaEvidence(json({ title: "Reserved answers", rulingOptions })));
    const result = await loadMetaEvidence(context({ fetcher }));
    expect(result.status === "ok" && result.metaEvidence.rulingOptions).toEqual(rulingOptions);
    expect(parseCachedMetaEvidenceResult(persisted(result))).toEqual(result);
  });

  it("ME-2 B15: a persisted entry whose descriptions are not strings is ignored", async () => {
    const good = persisted(await okResult()) as Record<string, unknown> & { metaEvidence: Record<string, unknown> };
    for (const descriptions of [{ "0": 1 }, [1], "x"]) {
      const rulingOptions = { type: "single-select", titles: ["A"], descriptions };
      expect(parseCachedMetaEvidenceResult({ ...good, metaEvidence: { ...good.metaEvidence, rulingOptions } })).toBeNull();
    }
  });

  it("A2: a rejection, a failure or a missing entry is never served from storage", () => {
    expect(parseCachedMetaEvidenceResult(persisted({ status: "invalid", metaEvidence: INVALID_META_EVIDENCE, reason: "script-not-allowlisted" }))).toBeNull();
    expect(parseCachedMetaEvidenceResult({ status: "failed", reason: "not-json", error: { code: "invalid-data", message: "x" } })).toBeNull();
    expect(parseCachedMetaEvidenceResult({ status: "missing" })).toBeNull();
  });

  it("B15: a malformed entry is ignored", async () => {
    const good = persisted(await okResult()) as Record<string, unknown> & { metaEvidence: Record<string, unknown> };
    const variants: unknown[] = [
      null,
      "ok",
      [],
      { ...good, uri: "/ipns/kleros.eth" },
      { ...good, uri: `/ipfs/${META_CID}/../../ipns/x` },
      { ...good, uri: `ipfs://${META_CID}` },
      { ...good, fileUrl: "javascript:alert(1)" },
      { ...good, fileUrl: `http://cdn.kleros.link/ipfs/${META_CID}` },
      { ...good, fileUrl: `${META_URL}/other` },
      { ...good, script: { ran: true, kind: "evil", jsonDuplicateKeys: false } },
      { ...good, script: { ran: false, reason: "trust-me" } },
      { ...good, metaEvidence: { ...good.metaEvidence, title: { evil: true } } },
      { ...good, metaEvidence: { ...good.metaEvidence, title: 42 } },
      { ...good, metaEvidence: { ...good.metaEvidence, rulingOptions: { type: "single-select", titles: [1, 2] } } },
      { ...good, metaEvidence: { ...good.metaEvidence, rulingOptions: "x" } },
      { ...good, metaEvidence: { ...good.metaEvidence, aliases: { "not-an-address": "Bob" } } },
      { ...good, metaEvidence: { ...good.metaEvidence, arbitrableChainID: { status: "valid", chainId: 10 } } },
      { ...good, metaEvidence: { ...good.metaEvidence, arbitratorChainID: "1" } },
      { ...good, metaEvidence: { ...good.metaEvidence, realityQuestion: { status: "trusted" } } },
      { ...good, metaEvidence: { ...good.metaEvidence, fallbackOutcomes: [{ a: 1 }] } },
      { ...good, metaEvidence: { ...good.metaEvidence, description: undefined } },
      { ...good, metaEvidence: undefined },
    ];
    for (const variant of variants) expect(parseCachedMetaEvidenceResult(variant)).toBeNull();
  });

  it("B15: what is read back is a fresh object, never the stored one", async () => {
    const stored = persisted(await okResult());
    const read = parseCachedMetaEvidenceResult(stored);
    expect(read).not.toBe(stored);
    expect(read?.status === "ok" && read.metaEvidence).not.toBe((stored as { metaEvidence: unknown }).metaEvidence);
  });
});
