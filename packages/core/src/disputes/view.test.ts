import { describe, expect, it } from "vitest";
import type { MetaEvidence, MetaEvidenceResult } from "../metaEvidence/types";
import type { Outcome } from "../types";
import { buildDisputeView, listCourts, lookupDispute, readDisputeDetails } from ".";
import type { Court, DisputeLookup, DisputeReads, DisputeView } from "./types";
import { fakeClient, fakeFetcher, GNOSIS, MAINNET, recordedDetection, recordedNode, recordedPolicyBodies } from "../test/disputes/testHelpers";
import type { Recording } from "../test/disputes/testHelpers";

const NOT_READ: Outcome<never> = { ok: false, error: { code: "rpc-error", message: "not read" } };

const META_EVIDENCE: MetaEvidence = {
  title: "Should this be accepted?",
  description: "",
  question: "Accept?",
  category: null,
  rulingOptions: { type: "single-select", titles: ["Yes", "No"] },
  fallbackOutcomes: null,
  fileURI: null,
  evidenceDisplayInterfaceURI: null,
  arbitrableInterfaceURI: null,
  aliases: {},
  dynamicScriptURI: null,
  arbitratorChainID: { status: "absent" },
  arbitrableChainID: { status: "absent" },
  displayParamsVersion: null,
  realityQuestion: null,
};

function okMetaEvidence(metaEvidence: Partial<MetaEvidence> = {}): MetaEvidenceResult {
  return {
    status: "ok",
    metaEvidence: { ...META_EVIDENCE, ...metaEvidence },
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

describe("buildDisputeView", () => {
  it("D-53: a not-found lookup is a view without a dispute", () => {
    const view = buildDisputeView({ lookup: { status: "not-found" }, reads: null, family: NOT_READ, courts: NOT_READ, metaEvidence: null, fundedRulings: null });
    expect(view).toEqual({ exists: false, reason: "not-found" });
  });

  it("§5.4: a chain without an arbitrator is a view without a dispute", () => {
    const view = buildDisputeView({ lookup: { status: "no-arbitrator" }, reads: null, family: NOT_READ, courts: NOT_READ, metaEvidence: null, fundedRulings: null });
    expect(view).toEqual({ exists: false, reason: "no-arbitrator" });
  });

  it("D-53, D-36: an unavailable lookup keeps its reason and never reads as not-found", () => {
    const error = { code: "rpc-error", message: "Could not read the dispute: HTTP request failed." } as const;
    const view = buildDisputeView({ lookup: { status: "unavailable", error }, reads: null, family: NOT_READ, courts: NOT_READ, metaEvidence: null, fundedRulings: null });
    expect(view).toEqual({ exists: false, reason: "unavailable", error });
  });

  it("04 §1, §5.8: maps the case-page fields of a plain resolver dispute (mainnet 1454)", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1454n);
    const family = await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");
    const view = existing(buildDisputeView({ lookup, reads, family: { ok: true, value: family }, courts, metaEvidence: okMetaEvidence(), fundedRulings: { ok: true, value: [] } }));
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
      decision: { ok: true, value: { kind: "winner", ruling: 0n, rulingText: "invalid / refused to arbitrate / tied", wonBy: "jury" } },
      realityNotice: { kind: "none", title: null },
    });
    expect(view.timeline).toMatchObject({
      ok: true,
      value: { columns: [{ state: "concluded" }, { state: "concluded" }, { state: "concluded" }, { state: "current", name: "execution" }] },
    });
  });

  it("§5.8, 04 §1: numberOfVotes is the first round's count of an appealed dispute (mainnet 328)", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 328n);
    const family = await recordedDetection(1, "0x135c573503f70dc290b1d60fe2e7f7eb114febd6");
    const view = existing(buildDisputeView({ lookup, reads, family: { ok: true, value: family }, courts, metaEvidence: okMetaEvidence(), fundedRulings: { ok: true, value: [] } }));
    expect(view.numberOfVotes).toEqual({ ok: true, value: 3 });
    expect(view.compatibility).toBe("full");
    expect(view.decision).toMatchObject({ ok: true, value: { ruling: 2n, rulingText: "No", wonBy: "jury" } });
  });

  it("D-36: mainnet 150 (unpinned meta-evidence, 2^128 - 1 choices) still renders dispute info and timeline", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 150n);
    const failed: MetaEvidenceResult = { status: "failed", reason: "fetch-error", error: { code: "rpc-error", message: "The gateway did not answer." } };
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence: failed, fundedRulings: null }));
    expect(view.arbitrable).toBe("0x594ec762b59978c97c82bc36ab493ed8b1f1f368");
    expect(view.timeline.ok).toBe(true);
    expect(view.numberOfVotes).toEqual({ ok: true, value: 3 });
    expect(view.court).toMatchObject({ ok: true, value: { id: 0n, name: "General Court" } });
    expect(view.decision).toMatchObject({ ok: true, value: { kind: "winner", rulingText: "invalid / refused to arbitrate / tied" } });
    expect(view.realityNotice).toEqual({ kind: "none", title: null });
  });

  it("D-36: mainnet 560 (meta-evidence is a PDF, not JSON) renders the rest of the page", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 560n);
    const notJson: MetaEvidenceResult = { status: "failed", reason: "not-json", error: { code: "invalid-data", message: "Not JSON." } };
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence: notJson, fundedRulings: null }));
    expect(view.arbitrable).toBe("0xc5e9ddebb09cd64dfacab4011a0d5cedaf7c9bdb");
    expect(view.court).toMatchObject({ ok: true, value: { id: 23n, name: "Humanity Court" } });
    expect(view.timeline.ok).toBe(true);
    expect(view.numberOfVotes.ok).toBe(true);
    expect(view.decision).toMatchObject({ ok: true, value: { kind: "winner", ruling: 2n, rulingText: "2", wonBy: "jury" } });
  });

  it("D-36: mainnet 1665 (home-proxy read reverts, max-uint choices) renders dispute info and timeline", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1665n);
    const failed: MetaEvidenceResult = { status: "failed", reason: "reality-lookup-failed", error: { code: "reverted", message: "The home proxy reverted." } };
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence: failed, fundedRulings: null }));
    expect(view.arbitrable).toBe("0x412c0617f357e640406ff0b4ee55f547c3692ba7");
    expect(view.court).toMatchObject({ ok: true, value: { id: 24n, name: "Oracle Court" } });
    expect(view.timeline.ok).toBe(true);
    expect(view.numberOfVotes).toEqual({ ok: true, value: 15 });
  });

  it("D-36: an unknown family degrades compatibility to view-only and keeps the reason", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1454n);
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence: null, fundedRulings: null }));
    expect(view.family).toEqual(NOT_READ);
    expect(view.compatibility).toBe("view-only");
  });

  it("D-36: a court missing from the list degrades the court and the timeline, not the view", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1665n);
    if (!courts.ok) throw new Error("courts expected");
    const withoutOracle = { ok: true as const, value: courts.value.filter((court) => court.id !== 24n) };
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts: withoutOracle, metaEvidence: null, fundedRulings: null }));
    expect(view.court).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(view.timeline).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(view.numberOfVotes.ok).toBe(true);
  });

  it("D-19, D-36: a failed court list degrades the court and the timeline with its reason", async () => {
    const { lookup, reads } = await load(MAINNET, 1, 1454n);
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts: NOT_READ, metaEvidence: null, fundedRulings: null }));
    expect(view.court).toEqual(NOT_READ);
    expect(view.timeline).toEqual(NOT_READ);
  });

  it("D-36: details not read degrade the vote count and an execution decision, never the view", async () => {
    const { lookup, courts } = await load(MAINNET, 1, 1454n);
    const view = existing(buildDisputeView({ lookup, reads: null, family: NOT_READ, courts, metaEvidence: null, fundedRulings: null }));
    expect(view.numberOfVotes.ok).toBe(false);
    expect(view.decision.ok).toBe(false);
    expect(view.timeline.ok).toBe(true);
  });

  it("§5.9: periods 0–2 have no decision even without the detail reads", async () => {
    const { lookup, courts } = await load(MAINNET, 1, 1454n);
    if (lookup.status !== "found") throw new Error("found expected");
    const inEvidence: DisputeLookup = { ...lookup, dispute: { ...lookup.dispute, period: 0 } };
    const view = existing(buildDisputeView({ lookup: inEvidence, reads: null, family: NOT_READ, courts, metaEvidence: null, fundedRulings: null }));
    expect(view.decision).toEqual({ ok: true, value: { kind: "none" } });
  });

  it("D-36: an empty votesLengths (Gnosis zeroed struct) is invalid data, not a crash", async () => {
    const { lookup, reads, courts } = await load(GNOSIS, 100, 0n);
    const empty: DisputeReads = { ...reads, votesLengths: { ok: true, value: [] } };
    const view = existing(buildDisputeView({ lookup, reads: empty, family: NOT_READ, courts, metaEvidence: null, fundedRulings: null }));
    expect(view.numberOfVotes).toMatchObject({ ok: false, error: { code: "invalid-data" } });
  });

  it("§5.9, D-36: in execution a failed funding scan degrades the decision instead of guessing a jury decision", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1454n);
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence: null, fundedRulings: NOT_READ }));
    expect(view.decision).toEqual(NOT_READ);
  });

  it("§5.9: in execution, a single funded ruling wins by default (Gnosis 0 bitmask titles)", async () => {
    const { lookup, reads, courts } = await load(GNOSIS, 100, 0n);
    const metaEvidence = okMetaEvidence({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C"] } });
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence, fundedRulings: { ok: true, value: [3n] } }));
    expect(view.decision).toEqual({ ok: true, value: { kind: "winner", ruling: 3n, rulingText: "B", wonBy: "default" } });
  });

  it("§5.9: in execution the current ruling is the jury's when the arbitrable was not scanned for funding", async () => {
    const { lookup, reads, courts } = await load(GNOSIS, 100, 0n);
    const metaEvidence = okMetaEvidence({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C"] } });
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence, fundedRulings: null }));
    expect(view.decision).toEqual({ ok: true, value: { kind: "winner", ruling: 5n, rulingText: "C", wonBy: "jury" } });
  });

  it("DR-DISPUTES-4, §5.9, A2: the invalid placeholder's ruling options are used for the decision text", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 328n);
    const placeholder: MetaEvidenceResult = {
      status: "invalid",
      reason: "script-not-allowlisted",
      metaEvidence: { ...META_EVIDENCE, rulingOptions: { type: "single-select", titles: ["Yes", "No"] } },
    };
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence: placeholder, fundedRulings: null }));
    expect(view.decision).toEqual({ ok: true, value: { kind: "winner", ruling: 2n, rulingText: "No", wonBy: "jury" } });
    expect(view.realityNotice).toEqual({ kind: "none", title: null });
  });

  it("§5.10: the Reality notice comes from the loaded meta-evidence", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1454n);
    const metaEvidence = okMetaEvidence({ realityQuestion: { status: "unverified", divergent: true, title: "Will it rain?" } });
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence, fundedRulings: null }));
    expect(view.realityNotice).toEqual({ kind: "unverified", title: "Will it rain?" });
  });

  it("A22: the view's arbitrable is the arbitrator's, whatever the meta-evidence says", async () => {
    const { lookup, reads, courts } = await load(MAINNET, 1, 1454n);
    const metaEvidence = okMetaEvidence({ aliases: { "0x0000000000000000000000000000000000000001": "Attacker" }, arbitrableInterfaceURI: "https://evil.example" });
    const view = existing(buildDisputeView({ lookup, reads, family: NOT_READ, courts, metaEvidence, fundedRulings: null }));
    expect(view.arbitrable).toBe("0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");
  });
});
