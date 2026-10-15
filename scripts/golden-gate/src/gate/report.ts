import type { ChainId, ScriptKind } from "../../../../packages/core/src/types";
import type { CidPath } from "../../../../packages/core/src/uri/types";
import { testnetCheckComplete, type ChainEnumeration, type DisputeNote, type ReferencesFile, type TestnetCheckItem } from "../enumerate/enumerate";
import type { Diagnostics } from "./browser";
import { PASSING_VERDICTS, REVIEW_VERDICTS, type SideOutcome, type Verdict } from "./compare";
import { OVERRIDE_1621, type RunPurpose } from "./plan";

/** One side of a run as logged: RPC URLs in its parameters and every URL in a failure's detail as host and fingerprint. */
export interface SideRecord {
  readonly scriptCid: CidPath;
  readonly params: unknown;
  /** Old runner only: the frame's origin, from its `sandbox` value; `null` when the script was not run. */
  readonly frame: "same-origin" | "opaque" | null;
  readonly outcome: SideOutcome;
  readonly durationMs: number;
  readonly diagnostics: Diagnostics | null;
}

export interface RunRecord {
  readonly id: string;
  readonly purpose: RunPurpose;
  readonly chainId: ChainId;
  readonly disputeId: number;
  readonly arbitrable: string;
  /** The script the meta-evidence names. */
  readonly cid: CidPath;
  readonly scriptKind: ScriptKind | null;
  /** The script text holds a literal non-ASCII character, which an opaque frame without a charset misreads (ADR 0004). */
  readonly charsetSensitive: boolean | null;
  readonly production: SideRecord;
  readonly newApp: SideRecord;
  readonly verdict: Verdict;
  /** Verdicts of earlier attempts: a run whose verdict failed on a missing result is run once more. */
  readonly earlierVerdicts: readonly Verdict[];
}

export interface CoverageEntry {
  readonly chainId: ChainId;
  readonly cid: CidPath;
  /** Runs that executed the script in both runners: a `harness-failure` run does not count. */
  readonly runs: number;
  /** The verdicts of every run of the script, `harness-failure` included. */
  readonly verdicts: Readonly<Partial<Record<Verdict, number>>>;
  /** `null` when exercised; otherwise why no run covers the script. */
  readonly unexercisedReason: string | null;
}

/** One dispute of an arbitrator chain, as `--disputes` names it (`<chain>:<dispute>`). */
export interface DisputeKey {
  readonly chainId: ChainId;
  readonly disputeId: number;
}

export interface GateOptions {
  readonly chains: readonly ChainId[];
  /** Gate only these disputes, enumerating only them; `null` for every dispute of `chains`. */
  readonly disputes: readonly DisputeKey[] | null;
  readonly cids: readonly string[] | null;
  readonly maxPerCid: number | null;
  readonly concurrency: number;
  readonly oldTimeoutMs: number;
  readonly newTimeoutMs: number;
  readonly reuseEnumeration: boolean;
  readonly skipBuild: boolean;
}

export interface GateLog {
  readonly generatedAt: string;
  readonly source: string;
  /** A run restricted by chain, CID or count covers part of the gate only and is not valid for the cutover. */
  readonly partial: boolean;
  readonly options: GateOptions;
  readonly environment: { readonly node: string; readonly chromium: string };
  readonly enumeration: {
    readonly generatedAt: string;
    readonly chains: readonly Omit<ChainEnumeration, "notes">[];
    readonly readErrors: readonly { readonly chainId: ChainId; readonly disputeId: number; readonly detail: string | null }[];
    /** Disputes whose meta-evidence the gateway did not serve: the only ones that could hide a reference without failing the gate. */
    readonly metaEvidenceUnfetched: readonly { readonly chainId: ChainId; readonly disputeId: number; readonly detail: string | null }[];
    readonly testnetRealityCheck: ReferencesFile["testnetRealityCheck"];
  };
  readonly summary: {
    readonly runs: number;
    readonly passed: number;
    readonly forReview: number;
    readonly failed: number;
    readonly byVerdict: Readonly<Partial<Record<Verdict, number>>>;
  };
  readonly coverage: readonly CoverageEntry[];
  readonly unexercised: readonly CoverageEntry[];
  /** No failing verdict, every listed testnet Reality dispute enumerated, and no dispute left unread. */
  readonly passed: boolean;
  readonly runs: readonly RunRecord[];
}

function count<T extends string>(items: readonly T[]): Partial<Record<T, number>> {
  const counts: Partial<Record<T, number>> = {};
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
  return counts;
}

function unexercisedReason(chain: ChainEnumeration | undefined, cid: CidPath, harnessFailures: number): string {
  if (harnessFailures > 0) return `its ${String(harnessFailures)} run${harnessFailures === 1 ? "" : "s"} failed in the harness, so neither runner executed it`;
  if (chain === undefined) return "its chain was not enumerated in this run";
  const listed = chain.scope === "listed" ? "listed " : "";
  const skipped = chain.notes.filter((note) => note.status === "registered-reality-proxy" && note.cid === cid).map((note) => note.disputeId);
  if (skipped.length > 0) return `referenced only by ${listed}registered Reality proxies, whose script neither app runs (spec 10.4): disputes ${skipped.join(", ")}`;
  return `no ${listed}dispute references it`;
}

/**
 * Per allowlisted CID of each enumerated chain (plus the dispute-1621 override), the runs that executed it; a run the
 * harness could not execute is listed in the verdicts but does not exercise the script.
 */
export function buildCoverage(references: ReferencesFile, runs: readonly RunRecord[], chains: readonly ChainId[]): CoverageEntry[] {
  const entries: CoverageEntry[] = [];
  for (const chainId of chains) {
    const listed = [...(references.allowlist[String(chainId)] ?? [])];
    if (chainId === OVERRIDE_1621.chainId) listed.push(OVERRIDE_1621.cid);
    const chain = references.chains.find((item) => item.chainId === chainId);
    for (const cid of listed) {
      const planned = runs.filter((run) => run.chainId === chainId && (run.production.scriptCid === cid || run.newApp.scriptCid === cid));
      const executed = planned.filter((run) => run.verdict !== "harness-failure").length;
      entries.push({
        chainId,
        cid,
        runs: executed,
        verdicts: count(planned.map((run) => run.verdict)),
        unexercisedReason: executed > 0 ? null : unexercisedReason(chain, cid, planned.length - executed),
      });
    }
  }
  return entries;
}

export function buildGateLog(input: {
  readonly references: ReferencesFile;
  readonly runs: readonly RunRecord[];
  readonly options: GateOptions;
  readonly partial: boolean;
  readonly chromium: string;
}): GateLog {
  const { references, runs, options } = input;
  const verdicts = runs.map((run) => run.verdict);
  const passedRuns = verdicts.filter((verdict) => PASSING_VERDICTS.has(verdict)).length;
  const forReview = verdicts.filter((verdict) => REVIEW_VERDICTS.has(verdict)).length;
  const failed = runs.length - passedRuns - forReview;
  const coverage = buildCoverage(references, runs, options.chains);
  const notesWith = (status: DisputeNote["status"]) =>
    references.chains.flatMap((chain) => chain.notes.filter((note) => note.status === status).map((note) => ({ chainId: chain.chainId, disputeId: note.disputeId, detail: note.detail })));
  const readErrors = notesWith("read-error");
  const testnetComplete = testnetCheckComplete(references.testnetRealityCheck, input.partial);
  return {
    generatedAt: new Date().toISOString(),
    source: "docs/parity/04-golden-cases.md §5, checklist C6",
    partial: input.partial,
    options,
    environment: { node: process.version, chromium: input.chromium },
    enumeration: {
      generatedAt: references.generatedAt,
      chains: references.chains.map((chain) => ({
        chainId: chain.chainId,
        source: chain.source,
        scope: chain.scope,
        blockNumber: chain.blockNumber,
        disputeCount: chain.disputeCount,
        statusCounts: chain.statusCounts,
      })),
      readErrors,
      metaEvidenceUnfetched: notesWith("meta-evidence-fetch-failed"),
      testnetRealityCheck: references.testnetRealityCheck,
    },
    summary: { runs: runs.length, passed: passedRuns, forReview, failed, byVerdict: count(verdicts) },
    coverage,
    unexercised: coverage.filter((entry) => entry.unexercisedReason !== null),
    passed: failed === 0 && readErrors.length === 0 && testnetComplete,
    runs,
  };
}

function cell(text: string): string {
  return text.replaceAll("|", String.raw`\|`).replaceAll("\n", " ");
}

function outcomeText(outcome: SideOutcome): string {
  if (outcome.kind === "success") return "success";
  if (outcome.kind === "harness-failure") return `harness-failure (${outcome.detail})`;
  return `${outcome.failureClass} (${outcome.detail})`;
}

function runRow(run: RunRecord): string {
  const production = `${outcomeText(run.production.outcome)}, ${run.production.frame ?? "not run"}`;
  return `| ${run.id} | \`${run.cid}\` | ${cell(production)} | ${cell(outcomeText(run.newApp.outcome))} | ${run.verdict} |`;
}

function listOrNone(items: readonly string[]): string {
  return items.length === 0 ? "none" : items.join(", ");
}

function disputeKey(error: { readonly chainId: ChainId; readonly disputeId: number }): string {
  return `${String(error.chainId)}:${String(error.disputeId)}`;
}

function missingText(item: TestnetCheckItem): string {
  const onChain = item.onChain === null ? "" : `; by its own events: ${item.onChain}`;
  return `${item.key} (meta-evidence API: ${item.status}${onChain})`;
}

const RUN_TABLE_HEADER = ["| Run | Script | Production (old runner, frame) | New runner | Verdict |", "|---|---|---|---|---|"];

/** The human-readable run log for the cutover pull request. */
export function renderGateLog(log: GateLog): string {
  const lines: string[] = [
    "# Dynamic-script output-equivalence gate (C6)",
    "",
    `Generated ${log.generatedAt} by \`scripts/golden-gate\` (${log.source}). Chromium ${log.environment.chromium}, Node ${log.environment.node}.`,
    "",
    `**Result: ${log.passed ? "PASSED" : "NOT PASSED"}${log.partial ? " (partial run: not valid for the cutover)" : ""}.** ${String(log.summary.runs)} runs: ${String(log.summary.passed)} passed, ${String(log.summary.forReview)} for manual review, ${String(log.summary.failed)} failed.`,
    "",
    "Rule (04 §5): where production succeeds, outputs must be identical; an empty `{}` or charset-garbled production output counts as a production failure; where production fails, a new-runner success is reviewed by hand and recorded in the ledger; where both fail, the failure class must match. A run the gate's harness could not execute on either side is recorded as `harness-failure` and fails the gate.",
    "",
    "## Enumeration",
    "",
    "| Chain | Source | Block | Disputes read | Running an allowlisted script |",
    "|---|---|---|---|---|",
    ...log.enumeration.chains.map(
      (chain) =>
        `| ${String(chain.chainId)} | ${chain.source} | ${String(chain.blockNumber)} | ${String(chain.disputeCount)}${chain.scope === "listed" ? " (listed only)" : ""} | ${String(chain.statusCounts.runs ?? 0)} |`,
    ),
    "",
    `Disputes left unread: ${listOrNone(log.enumeration.readErrors.map(disputeKey))}.`,
    `Disputes whose meta-evidence the gateway did not serve (a script they name is not known): ${listOrNone(log.enumeration.metaEvidenceUnfetched.map(disputeKey))}.`,
    `Sepolia and Chiado Reality-proxy disputes listed: ${String(log.enumeration.testnetRealityCheck.listed)}; not running their script through the meta-evidence API: ${listOrNone(log.enumeration.testnetRealityCheck.missing.map(missingText))}.`,
    "",
  ];
  const failedRuns = log.runs.filter((run) => !PASSING_VERDICTS.has(run.verdict) && !REVIEW_VERDICTS.has(run.verdict));
  const reviewRuns = log.runs.filter((run) => REVIEW_VERDICTS.has(run.verdict));
  lines.push("## Failures", "", ...(failedRuns.length === 0 ? ["None."] : [...RUN_TABLE_HEADER, ...failedRuns.map(runRow)]), "");
  lines.push("## For manual review (production fails, the new runner succeeds)", "", ...(reviewRuns.length === 0 ? ["None."] : [...RUN_TABLE_HEADER, ...reviewRuns.map(runRow)]), "");
  lines.push(
    "## Coverage per allowlisted script",
    "",
    "| Chain | Script | Runs | Verdicts | Unexercised because |",
    "|---|---|---|---|---|",
    ...log.coverage.map(
      (entry) =>
        `| ${String(entry.chainId)} | \`${entry.cid}\` | ${String(entry.runs)} | ${cell(
          Object.entries(entry.verdicts)
            .map(([verdict, total]) => `${verdict} ${String(total)}`)
            .join(", "),
        )} | ${cell(entry.unexercisedReason ?? "")} |`,
    ),
    "",
    "## All runs",
    "",
    ...RUN_TABLE_HEADER,
    ...log.runs.map(runRow),
    "",
  );
  return lines.join("\n");
}
