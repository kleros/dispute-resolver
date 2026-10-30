import { describe, expect, it } from "vitest";
import { INVALID_META_EVIDENCE } from "../metaEvidence";
import type { MetaEvidence, MetaEvidenceResult } from "../metaEvidence/types";
import type { Address, Outcome } from "../types";
import { buildDisputeView, listCourts, lookupDispute, readDisputeDetails } from ".";
import type { Court, DisputeLookup, DisputeReads, DisputeView } from "./types";
import { fakeClient, fakeFetcher, GNOSIS, MAINNET, recordedDetection, recordedNode, recordedPolicyBodies } from "../test/disputes/testHelpers";
import type { Recording } from "../test/disputes/testHelpers";

const NOT_READ: Outcome<never> = { ok: false, error: { code: "rpc-error", message: "not read" } };

function okMetaEvidence(metaEvidence: Partial<MetaEvidence> = {}): MetaEvidenceResult {
  return {
    status: "ok",
    metaEvidence: { ...INVALID_META_EVIDENCE, ...metaEvidence },
    uri: "/ipfs/QmZZHwJEYi6YFrhSvbDYXuBDT9vC9eCdK7gLaRwP1bYBDP",
    fileUrl: "https://cdn.kleros.link/ipfs/QmZZHwJEYi6YFrhSvbDYXuBDT9vC9eCdK7gLaRwP1bYBDP",
    script: { ran: false, reason: "no-script" },
    source: { kind: "locator", event: "not-read" },
  };
}

interface Loaded {
  readonly lookup: DisputeLookup;
  readonly reads: DisputeReads;
  readonly courts: Outcome<readonly Court[]>;
}

async function load(recording: Recording, chainId: number, disputeId: bigint): Promise<Loaded> {
  const { client } = fakeClient(recordedNode(recording));
  const lookup = await lookupDispute({ chainId, client }, disputeId);
  if (lookup.status !== "found") throw new Error(`dispute ${String(disputeId)} not found`);
  const family = await recordedDetection(chainId, lookup.binding.arbitrated).catch(() => undefined);
  const reads = await readDisputeDetails({ chainId, client }, lookup, family, null);
  const { fetcher } = fakeFetcher(recordedPolicyBodies(recording));
  const courts = await listCourts({ chainId, client, fetcher, env: {} });
  return { lookup, reads, courts };
}

function existing(view: DisputeView): Extract<DisputeView, { exists: true }> {
  if (!view.exists) throw new Error(`expected an existing dispute, got ${view.reason}`);
  return view;
}

const UNAVAILABLE = { code: "rpc-error", message: "Could not read the dispute: HTTP request failed." } as const;
const GATEWAY_DOWN: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "The gateway did not answer." } };
const NOT_JSON: MetaEvidenceResult = { status: "failed", reason: "not-json", error: { code: "invalid-data", message: "Not JSON." } };
const PROXY_REVERTED: MetaEvidenceResult = { status: "failed", reason: "reality-lookup-failed", error: { code: "reverted", message: "The home proxy reverted." } };

describe("buildDisputeView", () => {
  it.each<[string, DisputeLookup, DisputeView]>([
    ["a not-found lookup is a view without a dispute", { status: "not-found" }, { exists: false, reason: "not-found" }],
    ["a chain without an arbitrator is a view without a dispute", { status: "no-arbitrator" }, { exists: false, reason: "no-arbitrator" }],
    [
      "an unavailable lookup keeps its reason and never reads as not-found",
      { status: "unavailable", error: UNAVAILABLE },
      { exists: false, reason: "unavailable", error: UNAVAILABLE },
    ],
  ])("%s", (_, lookup, expected) => {
    expect(buildDisputeView({ lookup, reads: null, family: NOT_READ, courts: NOT_READ, metaEvidence: null })).toEqual(expected);
  });

  it("maps the case-page fields of a plain resolver dispute (mainnet 1454)", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1454n);
    const family = await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");
    const view = existing(buildDisputeView({ lookup, reads, family: { ok: true, value: family }, courts, metaEvidence: okMetaEvidence() }));
    expect(view).toMatchObject({
      exists: true,
      chainId: 1,
      disputeId: 1454n,
      arbitrable: "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf",
      family: { ok: true, value: { family: "idr-v2" } },
      compatibility: "full",
      period: 4,
      lastPeriodChange: 1673835923,
      numberOfVotes: { ok: true, value: 10 },
      court: { ok: true, value: { id: 8n, name: "Onboarding" } },
      realityNotice: { kind: "none", title: null },
    });
    expect(view.timeline).toMatchObject({
      ok: true,
      value: { columns: [{ state: "concluded" }, { state: "concluded" }, { state: "concluded" }, { state: "current", name: "execution" }] },
    });
  });

  it("numberOfVotes is the first round's count of an appealed dispute (mainnet 328)", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 328n);
    const family = await recordedDetection(1, "0x135c573503f70dc290b1d60fe2e7f7eb114febd6");
    const view = existing(buildDisputeView({ lookup, reads, family: { ok: true, value: family }, courts, metaEvidence: okMetaEvidence() }));
    expect(view.numberOfVotes).toEqual({ ok: true, value: 3 });
    expect(view.compatibility).toBe("full");
  });

  it.each<[string, bigint, MetaEvidenceResult, Address, bigint, string, number]>([
    ["mainnet 150 (unpinned meta-evidence, 2^128 - 1 choices)", 150n, GATEWAY_DOWN, "0x594ec762b59978c97c82bc36ab493ed8b1f1f368", 0n, "General Court", 3],
    ["mainnet 560 (meta-evidence is a PDF, not JSON)", 560n, NOT_JSON, "0xc5e9ddebb09cd64dfacab4011a0d5cedaf7c9bdb", 23n, "Humanity Court", 3],
    ["mainnet 1665 (home-proxy read reverts, max-uint choices)", 1665n, PROXY_REVERTED, "0x412c0617f357e640406ff0b4ee55f547c3692ba7", 24n, "Oracle Court", 15],
  ])("%s with an unknown family still renders the dispute info and timeline, view-only", async (_, disputeId, metaEvidence, arbitrable, courtId, courtName, votes) => {
    const { lookup, reads, courts } = await load(MAINNET, 1, disputeId);
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence }));
    expect(view).toMatchObject({
      arbitrable,
      family: NOT_READ,
      compatibility: "view-only",
      court: { ok: true, value: { id: courtId, name: courtName } },
      timeline: { ok: true },
      numberOfVotes: { ok: true, value: votes },
      realityNotice: { kind: "none", title: null },
    });
  });

  it("a court missing from the list degrades the court and the timeline, not the view", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1665n);
    if (!courts.ok) throw new Error("courts expected");
    const withoutOracle = { ok: true as const, value: courts.value.filter((court) => court.id !== 24n) };
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts: withoutOracle, metaEvidence: null }));
    expect(view.court).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(view.timeline).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(view.numberOfVotes.ok).toBe(true);
  });

  it("a failed court list degrades the court and the timeline with its reason", async () => {
    const { lookup, reads } = await load(MAINNET, 1, 1454n);
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts: NOT_READ, metaEvidence: null }));
    expect(view.court).toEqual(NOT_READ);
    expect(view.timeline).toEqual(NOT_READ);
  });

  it("details not read degrade the vote count and make a family that needs a local ID view-only, never the view", async () => {
    const { lookup, courts } = await load(MAINNET, 1, 1454n);
    const family = await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");
    const view = existing(buildDisputeView({ lookup, reads: null, family: { ok: true, value: family }, courts, metaEvidence: null }));
    expect(view.numberOfVotes.ok).toBe(false);
    expect(view.timeline.ok).toBe(true);
    expect(view.compatibility).toBe("view-only");
  });

  it("a failed vote count read degrades the vote count only", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1454n);
    const view = existing(buildDisputeView({ lookup, reads: { ...reads, votesLengths: NOT_READ }, family: NOT_READ, courts, metaEvidence: null }));
    expect(view.numberOfVotes).toEqual(NOT_READ);
    expect(view.timeline.ok).toBe(true);
  });

  it("an empty votesLengths (Gnosis zeroed struct) is invalid data, not a crash", async () => {
    const { lookup, reads, courts } = await load(GNOSIS, 100, 0n);
    const empty: DisputeReads = { ...reads, votesLengths: { ok: true, value: [] } };
    const view = existing(buildDisputeView({ lookup, reads: empty, family: NOT_READ, courts, metaEvidence: null }));
    expect(view.numberOfVotes).toMatchObject({ ok: false, error: { code: "invalid-data" } });
  });

  it("the Reality notice comes from the loaded meta-evidence", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1454n);
    const metaEvidence = okMetaEvidence({ realityQuestion: { status: "unverified", divergent: true, title: "Will it rain?" } });
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence }));
    expect(view.realityNotice).toEqual({ kind: "unverified", title: "Will it rain?" });
  });

  it("the view's arbitrable is the arbitrator's, whatever the meta-evidence says", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1454n);
    const metaEvidence = okMetaEvidence({ aliases: { "0x0000000000000000000000000000000000000001": "Attacker" }, arbitrableInterfaceURI: "https://evil.example" });
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence }));
    expect(view.arbitrable).toBe("0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");
  });
});
