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
  enumerateListed,
  recheckFromEvents,
  type ChainEnumeration,
  type EnumerationSource,
  type ReferencesFile,
  type ScriptReference,
} from "../enumerate/enumerate";
import { locateMetaEvidence } from "../enumerate/locator";
import { loadTestnetRealityDisputes } from "../enumerate/testnetData";
import { nodeHttpGet } from "../http";
import { createIpfsReader, type IpfsReader } from "../ipfs";
import { redactAlso } from "../env";
import { readJson, toJson, writeTextAtomically } from "../output";
import { GATE_LOG_JSON, GATE_LOG_MD, IPFS_CACHE_DIR, REFERENCES_FILE } from "../paths";
import { openGateBrowser, type GateBrowser } from "./browser";
import { bundleHarnesses, type HarnessBundles } from "./bundle";
import { executePlan } from "./execute";
import { defaultLegacySources, loadLegacyRedirectUrl } from "./legacyRedirect";
import { oldRedirectMap } from "./oldParams";
import { planRuns, type RunPlan } from "./plan";
import { buildWebApp, startPreview } from "./preview";
import { buildGateLog, renderGateLog, type DisputeKey, type GateLog, type GateOptions } from "./report";
import { rpcEnvironment, selectReferences } from "./select";

/** Chains whose meta-evidence the production API serves; any other arbitrator chain is read from its events (Chiado). */
const API_CHAINS: ReadonlySet<ChainId> = new Set([1, 100, 11155111]);

/** Disputes read at once during the enumeration, shared by the meta-evidence API and the gateway. */
const ENUMERATION_CONCURRENCY = 8;

const referencesFileSchema = z.object({
  generatedAt: z.string(),
  chains: z.array(z.looseObject({ chainId: z.number().int(), scope: z.enum(["all", "listed"]) })),
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

/**
 * C6 enumeration of every dispute of the chosen chains, or of the listed disputes only when `disputes` is given (the
 * check of the listed testnet Reality disputes then covers those of them that are listed).
 */
export async function enumerateReferences(
  env: Env,
  chains: readonly ChainId[],
  ipfs: IpfsReader,
  log: (line: string) => void,
  disputes: readonly DisputeKey[] | null = null,
): Promise<ReferencesFile> {
  const enumerations: ChainEnumeration[] = [];
  const references: ScriptReference[] = [];
  const readers = new Map<ChainId, ChainReader>();
  for (const chainId of chains) {
    const reader = await openChainReader(chainId, env);
    readers.set(chainId, reader);
    const source: EnumerationSource = API_CHAINS.has(chainId) ? "meta-evidence-api" : "chain-events";
    const locate = source === "meta-evidence-api" ? (disputeId: bigint) => locateMetaEvidence(nodeHttpGet, env, chainId, disputeId) : chainEventsLocator(reader);
    const deps = { ...chainEnumerationReads(reader), source, locate, ipfs, concurrency: ENUMERATION_CONCURRENCY, onProgress: log };
    const listed = disputes?.filter((key) => key.chainId === chainId).map((key) => BigInt(key.disputeId));
    const result = listed === undefined ? await enumerateChain(deps) : await enumerateListed(deps, listed);
    enumerations.push(result.chain);
    references.push(...result.references);
  }
  const testnet = loadTestnetRealityDisputes().filter(
    (item) => disputes === null || disputes.some((key) => key.chainId === item.chainId && BigInt(key.disputeId) === item.disputeId),
  );
  let check = checkTestnetReality(testnet, enumerations, references);
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

/** Whether an enumeration read every dispute of every arbitrator chain, so it can stand for the whole gate. */
function enumerationComplete(references: ReferencesFile): boolean {
  return ARBITRATOR_CHAINS.every((chainId) => references.chains.some((chain) => chain.chainId === chainId && chain.scope === "all"));
}

/** What the gate runs against: the enumeration `--reuse-enumeration` names, or a fresh one of the run's chains or disputes. */
async function gateReferences(env: Env, options: GateOptions, ipfs: IpfsReader, redact: (text: string) => string, log: (line: string) => void): Promise<ReferencesFile> {
  if (options.reuseEnumeration) return loadReferences();
  const references = await enumerateReferences(env, options.chains, ipfs, log, options.disputes);
  // Only a complete enumeration replaces the file `--reuse-enumeration` reads; a restricted one lives in the gate log.
  if (enumerationComplete(references)) writeTextAtomically(REFERENCES_FILE, redact(toJson(references)));
  return references;
}

/** Runs `work` with the built app served and Chromium open, and always stops both, also when the gate is interrupted. */
async function withPreviewAndBrowser<T>(bundles: HarnessBundles, redact: (text: string) => string, work: (browser: GateBrowser) => Promise<T>): Promise<T> {
  const preview = await startPreview();
  let browser: GateBrowser | null = null;
  let stopping: Promise<unknown> | null = null;
  // Both are stopped even when one fails to; a second call waits for the first.
  const stop = (): Promise<unknown> => (stopping ??= Promise.allSettled([browser?.close(), preview.stop()]));
  const onSignal = (signal: NodeJS.Signals): void => {
    void stop().then(() => {
      process.kill(process.pid, signal);
    });
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    browser = await openGateBrowser(preview.origin, bundles, redact);
    return await work(browser);
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await stop();
  }
}

/**
 * The C6 gate (04 §5): enumerate, plan, build and serve the app, run every plan in both runners inside Chromium, and
 * write `golden/gate-log.json` and `golden/gate-log.md`. Everything written or logged passes through `redactEnv` and has
 * the old runner's redirected URL redacted too.
 */
export async function runGate(env: Env, options: GateOptions, redactEnv: (text: string) => string, logLine: (line: string) => void): Promise<GateLog> {
  const legacyRedirectUrl = await loadLegacyRedirectUrl(defaultLegacySources());
  // The old runner's redirect patch logs the URL it redirects, which then reaches the diagnostics of the run log.
  const redact = redactAlso(redactEnv, legacyRedirectUrl, "<legacy Infura URL>");
  const log = (line: string): void => {
    logLine(redact(line));
  };
  const ipfs = createIpfsReader({ gateway: resolveGateway(env), get: nodeHttpGet, cacheDir: IPFS_CACHE_DIR });
  const references = await gateReferences(env, options, ipfs, redact, log);
  const chosen = selectReferences(references.references, options);
  const plans = planRuns(chosen, env, REGISTRY);
  log(`${String(plans.length)} runs planned for ${String(chosen.length)} disputes.`);
  const scripts = await fetchScripts(plans, ipfs);

  if (!options.skipBuild) {
    log("Building the web app.");
    await buildWebApp();
  }
  const bundles = await bundleHarnesses();
  const { records, chromium } = await withPreviewAndBrowser(bundles, redact, async (browser) => {
    let done = 0;
    const deps = { browser, scripts, oldRedirectMap: oldRedirectMap(env, legacyRedirectUrl), rpcEnv: rpcEnvironment(env), oldTimeoutMs: options.oldTimeoutMs, newTimeoutMs: options.newTimeoutMs };
    const runs = await mapWithConcurrency(plans, options.concurrency, async (plan) => {
      const record = await executePlan(plan, deps);
      done += 1;
      log(`[${String(done)}/${String(plans.length)}] ${record.id} ${record.cid}: ${record.verdict}`);
      return record;
    });
    return { records: runs, chromium: browser.version };
  });

  const restricted = options.disputes !== null || options.cids !== null || options.maxPerCid !== null;
  const partial = restricted || !ARBITRATOR_CHAINS.every((chainId) => options.chains.includes(chainId)) || !enumerationComplete(references);
  const gateLog = buildGateLog({ references, runs: records, options, partial, chromium });
  writeTextAtomically(GATE_LOG_JSON, redact(toJson(gateLog)));
  writeTextAtomically(GATE_LOG_MD, redact(renderGateLog(gateLog)));
  return gateLog;
}
