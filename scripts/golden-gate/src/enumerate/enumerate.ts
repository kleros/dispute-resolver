import { getAddress } from "viem";
import { lookupDispute } from "../../../../packages/core/src/disputes";
import { REGISTRY } from "../../../../packages/core/src/registry";
import type { Registry } from "../../../../packages/core/src/registry/types";
import type { Address, ChainId } from "../../../../packages/core/src/types";
import { normalizeIpfsPath, toCidPath } from "../../../../packages/core/src/uri";
import type { CidPath } from "../../../../packages/core/src/uri/types";
import { caseKey } from "../cases";
import type { ChainReader } from "../chains";
import { mapWithConcurrency } from "../concurrency";
import type { IpfsReader } from "../ipfs";
import { locateFromChainEvents } from "./chainEvents";
import { countDisputes, disputeExists } from "./count";
import { gateScript, isJsonObject, type JsonObject } from "./gating";
import type { LocatorResult } from "./locator";
import type { TestnetRealityDispute } from "./testnetData";

/** How a chain's meta-evidence URIs are found: production's meta-evidence API, or the chain's events where the API does not serve it. */
export type EnumerationSource = "meta-evidence-api" | "chain-events";

/** The meta-evidence fields the script parameters are built from (spec 9.5), kept only when present in the document. */
export type ChainIdFields = Readonly<Partial<Record<"arbitratorChainID" | "arbitrableChainID", unknown>>>;

/** One dispute that runs an allowlisted dynamic script in the new app (C6). */
export interface ScriptReference {
  readonly chainId: ChainId;
  readonly disputeId: number;
  /** `disputes(id).arbitrated`, lowercase (A22); the old app saw it checksummed, as ethers returns it. */
  readonly arbitrable: Address;
  readonly cid: CidPath;
  readonly scriptUri: string;
  readonly metaEvidenceUri: string;
  /** Where the meta-evidence URI came from: the chain's source, or its events for a listed testnet dispute the API misnames. */
  readonly metaEvidenceSource: EnumerationSource;
  readonly chainIdFields: ChainIdFields;
}

/** Why a dispute runs no script, or why its meta-evidence could not be read. */
export type DisputeStatus =
  | "runs"
  | "no-script"
  | "not-an-object"
  | "registered-reality-proxy"
  | "script-uri-not-content-addressed"
  | "script-not-allowlisted"
  | "meta-evidence-missing"
  | "meta-evidence-uri-not-content-addressed"
  | "meta-evidence-fetch-failed"
  | "meta-evidence-not-json"
  | "read-error";

/** A dispute that runs no script, with its reason; for a registered Reality proxy, the allowlisted CID production skips. */
export interface DisputeNote {
  readonly disputeId: number;
  readonly status: Exclude<DisputeStatus, "runs">;
  readonly detail: string | null;
  readonly cid: CidPath | null;
}

export interface ChainEnumeration {
  readonly chainId: ChainId;
  readonly source: EnumerationSource;
  readonly blockNumber: number;
  readonly disputeCount: number;
  readonly statusCounts: Readonly<Partial<Record<DisputeStatus, number>>>;
  /** Every dispute that runs no script, except the many with no script at all (counted in `statusCounts`). */
  readonly notes: readonly DisputeNote[];
}

/** 04 §5's Sepolia and Chiado Reality-proxy disputes that the enumeration did not find running a script. */
export interface TestnetCheckItem {
  readonly key: string;
  /** What the chain's enumeration found for the dispute. */
  readonly status: DisputeStatus | "not-enumerated";
  /** What the dispute's own events say (its meta-evidence read from the chain), when they were read; `runs` adds it to the gate. */
  readonly onChain: DisputeStatus | null;
}

export interface TestnetCheck {
  readonly listed: number;
  readonly missing: readonly TestnetCheckItem[];
}

/** Whether every listed testnet Reality dispute runs its script, through the API or through its own events. */
export function testnetCheckComplete(check: TestnetCheck, enumeratedOnly: boolean): boolean {
  return check.missing.every((item) => item.onChain === "runs" || (enumeratedOnly && item.status === "not-enumerated"));
}

export interface ReferencesFile {
  readonly generatedAt: string;
  readonly chains: readonly ChainEnumeration[];
  readonly references: readonly ScriptReference[];
  readonly testnetRealityCheck: TestnetCheck;
  /** Arbitrator chain to its allowlisted CIDs (core `REGISTRY.dynamicScriptAllowlist`), for the coverage report. */
  readonly allowlist: Readonly<Record<string, readonly CidPath[]>>;
}

type DisputeOutcome = { readonly status: "runs"; readonly reference: ScriptReference } | { readonly status: Exclude<DisputeStatus, "runs">; readonly note: DisputeNote };

/** The arbitrated contract of a dispute (A22), or why it could not be read. */
export type ArbitrableRead = { readonly ok: true; readonly arbitrable: Address } | { readonly ok: false; readonly detail: string };

/** The services one chain's enumeration uses, injected so it is tested without a chain. */
export interface EnumerationDeps {
  readonly chainId: ChainId;
  readonly blockNumber: bigint;
  readonly source: EnumerationSource;
  /** The number of disputes as of `blockNumber`. */
  count(): Promise<bigint>;
  arbitrableOf(disputeId: bigint): Promise<ArbitrableRead>;
  locate(disputeId: bigint, arbitrable: Address): Promise<LocatorResult>;
  readonly ipfs: IpfsReader;
  readonly registry?: Registry;
  readonly concurrency: number;
  onProgress(line: string): void;
}

/** The chain half of `EnumerationDeps` over core, as of the reader's block. */
export function chainEnumerationReads(reader: ChainReader): Pick<EnumerationDeps, "chainId" | "blockNumber" | "count" | "arbitrableOf"> {
  return {
    chainId: reader.chainId,
    blockNumber: reader.block,
    count: () => countDisputes(disputeExists(reader)),
    arbitrableOf: async (disputeId) => {
      const lookup = await lookupDispute({ chainId: reader.chainId, client: reader.client }, disputeId);
      if (lookup.status === "found") return { ok: true, arbitrable: lookup.binding.arbitrated };
      return { ok: false, detail: lookup.status === "unavailable" ? lookup.error.message : `the dispute lookup answered ${lookup.status}` };
    },
  };
}

function note(disputeId: bigint, status: Exclude<DisputeStatus, "runs">, detail: string | null, cid: CidPath | null = null): DisputeOutcome {
  return { status, note: { disputeId: Number(disputeId), status, detail, cid } };
}

function chainIdFields(document: JsonObject): ChainIdFields {
  const fields: Partial<Record<"arbitratorChainID" | "arbitrableChainID", unknown>> = {};
  if ("arbitratorChainID" in document) fields.arbitratorChainID = document.arbitratorChainID;
  if ("arbitrableChainID" in document) fields.arbitrableChainID = document.arbitrableChainID;
  return fields;
}

/** The allowlisted CID a registered Reality proxy's meta-evidence names, which production and the new app both skip. */
function skippedCid(document: unknown): CidPath | null {
  if (!isJsonObject(document) || typeof document.dynamicScriptURI !== "string") return null;
  const path = normalizeIpfsPath(document.dynamicScriptURI);
  return path === null ? null : toCidPath(path);
}

function parseDocument(text: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** One dispute, in core's order (spec 9.1): arbitrable from the arbitrator, locator, content addressing, file, script gates. */
async function enumerateDispute(deps: EnumerationDeps, disputeId: bigint): Promise<DisputeOutcome> {
  const { chainId, registry = REGISTRY } = deps;
  const read = await deps.arbitrableOf(disputeId);
  if (!read.ok) return note(disputeId, "read-error", read.detail);
  const { arbitrable } = read;
  const located = await deps.locate(disputeId, arbitrable);
  if (located.status === "error") return note(disputeId, "read-error", located.detail);
  if (located.status === "missing") return note(disputeId, "meta-evidence-missing", located.detail);
  const path = normalizeIpfsPath(located.uri);
  if (path === null) return note(disputeId, "meta-evidence-uri-not-content-addressed", JSON.stringify(located.uri));
  const file = await deps.ipfs.read(path);
  if (!file.ok) return note(disputeId, "meta-evidence-fetch-failed", file.detail);
  const document = parseDocument(file.text);
  if (!document.ok) return note(disputeId, "meta-evidence-not-json", path);
  const gate = gateScript(document.value, chainId, arbitrable, registry);
  switch (gate.kind) {
    case "skipped":
      return note(disputeId, gate.reason, null, gate.reason === "registered-reality-proxy" ? skippedCid(document.value) : null);
    case "refused":
      return note(disputeId, gate.reason, gate.scriptUri);
    case "runs":
      return {
        status: "runs",
        reference: {
          chainId,
          disputeId: Number(disputeId),
          arbitrable,
          cid: gate.cid,
          scriptUri: gate.scriptUri,
          metaEvidenceUri: path,
          metaEvidenceSource: deps.source,
          chainIdFields: chainIdFields(gate.metaEvidence),
        },
      };
  }
}

/** Every dispute of one chain, 0 to the count as of the reader's block. */
export async function enumerateChain(deps: EnumerationDeps): Promise<{ readonly chain: ChainEnumeration; readonly references: ScriptReference[] }> {
  const { chainId } = deps;
  const count = await deps.count();
  deps.onProgress(`chain ${String(chainId)}: ${count.toString()} disputes as of block ${deps.blockNumber.toString()} (${deps.source})`);
  const ids = Array.from({ length: Number(count) }, (_, index) => BigInt(index));
  let done = 0;
  const outcomes = await mapWithConcurrency(ids, deps.concurrency, async (disputeId) => {
    const outcome = await enumerateDispute(deps, disputeId);
    done += 1;
    if (done % 100 === 0) deps.onProgress(`chain ${String(chainId)}: ${String(done)}/${count.toString()} disputes read`);
    return outcome;
  });
  // A read error is a transport failure (the API or the RPC did not answer): those disputes are read once more, one at
  // a time, after the first pass, so a burst of refusals does not leave them out of the gate.
  const unread = outcomes.flatMap((outcome, index) => (outcome.status === "read-error" ? [index] : []));
  if (unread.length > 0) deps.onProgress(`chain ${String(chainId)}: reading ${String(unread.length)} disputes again after read errors`);
  for (const index of unread) outcomes[index] = await enumerateDispute(deps, BigInt(index));
  const statusCounts: Partial<Record<DisputeStatus, number>> = {};
  const references: ScriptReference[] = [];
  const notes: DisputeNote[] = [];
  for (const outcome of outcomes) {
    statusCounts[outcome.status] = (statusCounts[outcome.status] ?? 0) + 1;
    if (outcome.status === "runs") references.push(outcome.reference);
    else if (outcome.status !== "no-script") notes.push(outcome.note);
  }
  return {
    chain: { chainId, source: deps.source, blockNumber: Number(deps.blockNumber), disputeCount: Number(count), statusCounts, notes },
    references,
  };
}

/** The meta-evidence locator of a chain: production's API, or the chain's events (`chain-events`). */
export function chainEventsLocator(reader: ChainReader): (disputeId: bigint, arbitrable: Address) => Promise<LocatorResult> {
  return (disputeId, arbitrable) => locateFromChainEvents(reader, disputeId, arbitrable);
}

/** 04 §5: every listed testnet Reality-proxy dispute must be enumerated as running its script. */
export function checkTestnetReality(listed: readonly TestnetRealityDispute[], chains: readonly ChainEnumeration[], references: readonly ScriptReference[]): TestnetCheck {
  const running = new Set(references.map((reference) => caseKey(reference.chainId, BigInt(reference.disputeId))));
  const noted = new Map(chains.flatMap((chain) => chain.notes.map((item) => [caseKey(chain.chainId, BigInt(item.disputeId)), item.status] as const)));
  const enumerated = new Set(chains.map((chain) => chain.chainId));
  const missing = listed
    .map((dispute) => caseKey(dispute.chainId, dispute.disputeId))
    .filter((key) => !running.has(key))
    .map((key) => {
      const chainId = Number(key.split(":")[0]);
      const status: DisputeStatus | "not-enumerated" = noted.get(key) ?? (enumerated.has(chainId) ? "no-script" : "not-enumerated");
      return { key, status, onChain: null };
    });
  return { listed: listed.length, missing };
}

/**
 * Reads listed testnet Reality disputes that the API's meta-evidence leaves without their script from their own
 * events instead (`chain-events`), so the gate still runs their script; the check records both answers, the
 * difference being a finding about the meta-evidence API for the maintainer.
 */
export async function recheckFromEvents(deps: EnumerationDeps, check: TestnetCheck): Promise<{ readonly check: TestnetCheck; readonly references: ScriptReference[] }> {
  const references: ScriptReference[] = [];
  const missing: TestnetCheckItem[] = [];
  for (const item of check.missing) {
    const [chain, dispute] = item.key.split(":");
    if (Number(chain) !== deps.chainId || item.status === "not-enumerated" || dispute === undefined) {
      missing.push(item);
      continue;
    }
    const outcome = await enumerateDispute(deps, BigInt(dispute));
    if (outcome.status === "runs") references.push(outcome.reference);
    missing.push({ ...item, onChain: outcome.status });
  }
  return { check: { listed: check.listed, missing }, references };
}

/** The address as ethers returned it to the old app: EIP-55 checksummed. */
export function checksummed(address: Address): string {
  return getAddress(address);
}
