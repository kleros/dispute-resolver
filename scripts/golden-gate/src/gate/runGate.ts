import { existsSync } from "node:fs";
import { z } from "zod";
import { REGISTRY } from "../../../../packages/core/src/registry";
import type { ChainId, Env } from "../../../../packages/core/src/types";
import { normalizeIpfsPath, resolveGateway } from "../../../../packages/core/src/uri";
import type { CidPath } from "../../../../packages/core/src/uri/types";
import { ARBITRATOR_CHAINS, openChainReader, type ChainReader } from "../chains";
import { mapWithConcurrency } from "../concurrency";
import {
  chainEnumerationReads,
  chainEventsLocator,
  checkTestnetReality,
  enumerateChain,
  recheckFromEvents,
  type ChainEnumeration,
  type ReferencesFile,
  type ScriptReference,
} from "../enumerate/enumerate";
import { locateMetaEvidence } from "../enumerate/locator";
import { loadTestnetRealityDisputes } from "../enumerate/testnetData";
import { nodeHttpGet } from "../http";
import { createIpfsReader, type IpfsReader } from "../ipfs";
import { readJson, toJson, writeTextAtomically } from "../output";
import { GATE_LOG_JSON, GATE_LOG_MD, IPFS_CACHE_DIR, REFERENCES_FILE } from "../paths";
import { openGateBrowser } from "./browser";
import { bundleHarnesses } from "./bundle";
import { executePlan } from "./execute";
import { defaultLegacySources, loadLegacyRedirectUrl } from "./legacyRedirect";
import { oldRedirectMap } from "./oldParams";
import { planRuns, type RunPlan } from "./plan";
import { buildWebApp, startPreview } from "./preview";
import { buildGateLog, renderGateLog, type GateLog, type GateOptions, type RunRecord } from "./report";
import { rpcEnvironment, selectReferences } from "./select";

/** Chains whose meta-evidence the production API serves; any other arbitrator chain is read from its events (Chiado). */
const API_CHAINS: ReadonlySet<ChainId> = new Set([1, 100, 11155111]);

/** Disputes read at once during the enumeration, shared by the meta-evidence API and the gateway. */
const ENUMERATION_CONCURRENCY = 8;

const referencesFileSchema = z.object({
  generatedAt: z.string(),
  chains: z.array(z.looseObject({ chainId: z.number().int() })),
  references: z.array(z.looseObject({ chainId: z.number().int(), disputeId: z.number().int(), cid: z.string() })),
  testnetRealityCheck: z.object({ listed: z.number().int(), missing: z.array(z.object({ key: z.string(), status: z.string(), onChain: z.string().nullable() })) }),
  allowlist: z.record(z.string(), z.array(z.string())),
});

/** A previous enumeration (`golden/script-references.json`), written by this tool. */
function loadReferences(): ReferencesFile {
  if (!existsSync(REFERENCES_FILE)) throw new Error("golden/script-references.json does not exist: run without --reuse-enumeration first.");
  const value = readJson(REFERENCES_FILE);
  if (!referencesFileSchema.safeParse(value).success) {
    throw new Error("golden/script-references.json does not have the shape this version of the gate writes: run without --reuse-enumeration to enumerate again.");
  }
  // The schema checked the shape this tool wrote; the file is read back as the type it was written as.
  return value as ReferencesFile;
}

/** C6 enumeration of every dispute of the chosen chains, written to `golden/script-references.json`. */
export async function enumerateReferences(env: Env, chains: readonly ChainId[], ipfs: IpfsReader, log: (line: string) => void): Promise<ReferencesFile> {
  const enumerations: ChainEnumeration[] = [];
  const references: ScriptReference[] = [];
  const readers = new Map<ChainId, ChainReader>();
  for (const chainId of chains) {
    const reader = await openChainReader(chainId, env);
    readers.set(chainId, reader);
    const source = API_CHAINS.has(chainId) ? "meta-evidence-api" : "chain-events";
    const locate = source === "meta-evidence-api" ? (disputeId: bigint) => locateMetaEvidence(nodeHttpGet, env, chainId, disputeId) : chainEventsLocator(reader);
    const result = await enumerateChain({ ...chainEnumerationReads(reader), source, locate, ipfs, concurrency: ENUMERATION_CONCURRENCY, onProgress: log });
    enumerations.push(result.chain);
    references.push(...result.references);
  }
  let check = checkTestnetReality(loadTestnetRealityDisputes(), enumerations, references);
  for (const [chainId, reader] of readers) {
    const recheck = await recheckFromEvents(
      { ...chainEnumerationReads(reader), source: "chain-events", locate: chainEventsLocator(reader), ipfs, concurrency: 1, onProgress: log },
      check,
    );
    check = recheck.check;
    references.push(...recheck.references);
    for (const reference of recheck.references) {
      log(`chain ${String(chainId)}: dispute ${String(reference.disputeId)} runs ${reference.cid} by its own events, not by the meta-evidence API's answer.`);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    chains: enumerations,
    references,
    testnetRealityCheck: check,
    allowlist: Object.fromEntries(Object.entries(REGISTRY.dynamicScriptAllowlist).map(([chainId, cids]) => [chainId, [...cids]])),
  };
}

/** The texts of the scripts the plans run, through the gateway (`null` where it does not serve one). */
async function fetchScripts(plans: readonly RunPlan[], ipfs: IpfsReader): Promise<Map<CidPath, string | null>> {
  const cids = [...new Set(plans.flatMap((plan) => [plan.old.scriptCid, plan.new.scriptCid]))];
  const texts = await Promise.all(
    cids.map(async (cid) => {
      const path = normalizeIpfsPath(`/ipfs/${cid}`);
      if (path === null) return null;
      const file = await ipfs.read(path);
      return file.ok ? file.text : null;
    }),
  );
  return new Map(cids.map((cid, index) => [cid, texts[index] ?? null]));
}

/**
 * The C6 gate (04 §5): enumerate, plan, build and serve the app, run every plan in both runners inside Chromium, and
 * write `golden/gate-log.json` and `golden/gate-log.md`. Everything written passes through `redact`.
 */
export async function runGate(env: Env, options: GateOptions, redact: (text: string) => string, log: (line: string) => void): Promise<GateLog> {
  const legacyRedirectUrl = await loadLegacyRedirectUrl(defaultLegacySources());
  const ipfs = createIpfsReader({ gateway: resolveGateway(env), get: nodeHttpGet, cacheDir: IPFS_CACHE_DIR });
  let references: ReferencesFile;
  if (options.reuseEnumeration) {
    references = loadReferences();
  } else {
    references = await enumerateReferences(env, options.chains, ipfs, log);
    writeTextAtomically(REFERENCES_FILE, redact(toJson(references)));
  }
  const chosen = selectReferences(
    references.references.filter((reference) => options.chains.includes(reference.chainId)),
    options.cids,
    options.maxPerCid,
  );
  const plans = planRuns(chosen, env, REGISTRY);
  log(`${String(plans.length)} runs planned for ${String(chosen.length)} disputes.`);
  const scripts = await fetchScripts(plans, ipfs);

  if (!options.skipBuild) {
    log("Building the web app.");
    await buildWebApp();
  }
  const bundles = await bundleHarnesses();
  const preview = await startPreview();
  const browser = await openGateBrowser(preview.origin, bundles);
  let records: RunRecord[];
  try {
    let done = 0;
    const deps = { browser, scripts, oldRedirectMap: oldRedirectMap(env, legacyRedirectUrl), rpcEnv: rpcEnvironment(env), oldTimeoutMs: options.oldTimeoutMs, newTimeoutMs: options.newTimeoutMs };
    records = await mapWithConcurrency(plans, options.concurrency, async (plan) => {
      const record = await executePlan(plan, deps);
      done += 1;
      log(`[${String(done)}/${String(plans.length)}] ${record.id} ${record.cid}: ${record.verdict}`);
      return record;
    });
  } finally {
    await browser.close();
    await preview.stop();
  }

  const partial = options.cids !== null || options.maxPerCid !== null || !ARBITRATOR_CHAINS.every((chainId) => options.chains.includes(chainId));
  const gateLog = buildGateLog({ references, runs: records, options, partial, chromium: browser.version });
  writeTextAtomically(GATE_LOG_JSON, redact(toJson(gateLog)));
  writeTextAtomically(GATE_LOG_MD, redact(renderGateLog(gateLog)));
  return gateLog;
}
