import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, FieldResult } from "./compare/engine";
import { CASE_REPORTS_DIR, NEW_URL, PROD_URL, REPORTS_DIR } from "./config";
import { LEDGER } from "./ledger";
import { redactRpcFields } from "./redact";
import type { Snapshot } from "./types";

// The JSON and Markdown reports under e2e/golden/reports/ (ignored by git). Each test writes its own result file, since
// workers are separate processes; the teardown project assembles them. No API key is written: the extractors store
// every URL of the evidence-display parameters as its host and a fingerprint (`redact.ts`), and each result's RPC-named
// fields and D-35 RPC mismatches are redacted again on its way to its file, so an RPC URL that reached a snapshot by
// another path is never written either. The report names the two apps by their origins only, and each snapshot records
// its page as the app's origin and the screen path (`recordedPageUrl`), never the rest of a configured base URL.

export interface ScreenResult {
  readonly id: string;
  readonly screen: "case" | "ongoing" | "create";
  readonly chainId: number;
  readonly disputeId: number | null;
  readonly description: string;
  /** The account context: the announced account, or why there is none. */
  readonly account: string | null;
  readonly accountNote: string | null;
  readonly passed: boolean;
  /** 1 for the first run, 2 for the retry (the golden project retries once: production and the RPCs are shared). */
  readonly attempt: number;
  readonly fields: readonly FieldResult[];
  readonly checks: readonly CheckResult[];
  readonly snapshots: { readonly production: Snapshot; readonly next: Snapshot };
}

export function resetCaseReports(): void {
  rmSync(CASE_REPORTS_DIR, { recursive: true, force: true });
  mkdirSync(CASE_REPORTS_DIR, { recursive: true });
}

/** Where the per-screen results and the assembled reports are written; the tests of the writer pass a scratch directory. */
export interface ReportDirectories {
  readonly cases: string;
  readonly reports: string;
}

const DEFAULT_DIRECTORIES: ReportDirectories = { cases: CASE_REPORTS_DIR, reports: REPORTS_DIR };

function fileNameOf(result: ScreenResult): string {
  const parts = [result.screen, result.chainId.toString(), ...(result.disputeId === null ? [] : [result.disputeId.toString()])];
  return `${parts.join("-")}.json`;
}

/** Writes one screen's result with every RPC URL in it (snapshots, compared values, mismatches) redacted. */
export function writeScreenResult(result: ScreenResult, directories: ReportDirectories = DEFAULT_DIRECTORIES): void {
  mkdirSync(directories.cases, { recursive: true });
  writeFileSync(join(directories.cases, fileNameOf(result)), `${JSON.stringify(redactRpcFields(result), null, 2)}\n`);
}

function readResults(directory: string): ScreenResult[] {
  let files: string[];
  try {
    files = readdirSync(directory).filter((file) => file.endsWith(".json"));
  } catch {
    files = [];
  }
  const order = { case: 0, ongoing: 1, create: 2 };
  return files
    .map((file) => JSON.parse(readFileSync(join(directory, file), "utf8")) as ScreenResult)
    .sort((a, b) => order[a.screen] - order[b.screen] || a.chainId - b.chainId || (a.disputeId ?? 0) - (b.disputeId ?? 0));
}

/** The apps by origin: a base URL set in the environment could carry a path or a credential. */
const PRODUCTION_ORIGIN = new URL(PROD_URL).origin;
const NEW_ORIGIN = new URL(NEW_URL).origin;

function count(result: ScreenResult, status: FieldResult["status"]): number {
  return result.fields.filter((field) => field.status === status).length;
}

/** A value for a Markdown table cell: JSON, shortened, with pipes and newlines escaped. */
function cell(value: unknown, limit = 160): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const short = text.length > limit ? `${text.slice(0, limit)}…` : text;
  return short.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function summaryRow(result: ScreenResult): string {
  const failedChecks = result.checks.filter((check) => check.blocking && !check.ok).length;
  const notes = result.checks.filter((check) => !check.blocking && !check.ok).length;
  const columns = [
    result.id,
    result.passed ? "pass" : "**FAIL**",
    count(result, "match"),
    count(result, "expected-difference"),
    count(result, "difference"),
    count(result, "skipped") + count(result, "unobservable"),
    failedChecks,
    notes,
    result.attempt,
    result.account ?? `none (${result.accountNote ?? "no contributor"})`,
  ];
  return `| ${columns.map((column) => cell(column, 120)).join(" | ")} |`;
}

function fieldRows(result: ScreenResult): string[] {
  const interesting = result.fields.filter((field) => field.status !== "match");
  if (interesting.length === 0) return ["All fields match production."];
  return [
    "| Field | Status | Entries | Production | New app | Detail |",
    "|---|---|---|---|---|---|",
    ...interesting.map(
      (field) => `| ${field.field} | ${field.status} | ${field.entries.join(", ")} | ${cell(field.production)} | ${cell(field.next)} | ${cell(field.detail, 240)} |`,
    ),
  ];
}

function checkStatus(check: CheckResult): string {
  if (check.ok) return "ok";
  return check.blocking ? "**FAIL**" : "note: not met";
}

function checkRows(result: ScreenResult): string[] {
  if (result.checks.length === 0) return [];
  return [
    "",
    "| Check (04 §2) | Result | Expected | New app |",
    "|---|---|---|---|",
    ...result.checks.map((check) => `| ${check.name} | ${checkStatus(check)} | ${cell(check.expected)} | ${cell(check.actual)} |`),
  ];
}

function ledgerRows(): string[] {
  return [
    "| Entry | Title | Snapshot fields | How it is applied |",
    "|---|---|---|---|",
    ...LEDGER.map((entry) => `| ${entry.id} | ${cell(entry.title, 120)} | ${entry.fields.length === 0 ? "none" : entry.fields.join(", ")} | ${cell(entry.note, 400)} |`),
  ];
}

function markdown(results: readonly ScreenResult[], generatedAt: string): string {
  const failed = results.filter((result) => !result.passed).length;
  const lines = [
    "# Golden-case parity report",
    "",
    `Generated ${generatedAt}. Production: ${PRODUCTION_ORIGIN}. New app: ${NEW_ORIGIN}. ${results.length.toString()} screens, ${failed.toString()} failed.`,
    "",
    "Rules (docs/parity/04-golden-cases.md §1): addresses case-insensitive, amounts as wei integers, markdown as plain text with all whitespace removed, countdowns and deadlines on presence and sign, withdrawable amounts only under the account context. Ledger entries (D-nn) and proposals (P-nn) are applied per field. Production values it never renders (the arbitrable, `lastPeriodChange`, full evidence submitters, appeal-card ruling codes) are read from the old app's own React component state; everything it renders is read from its DOM.",
    "",
    "| Screen | Result | Match | Expected (ledger) | Unexplained | Skipped | Failed checks | Notes | Attempt | Account |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...results.map(summaryRow),
  ];
  for (const result of results) {
    lines.push("", `## ${result.id}: ${result.passed ? "pass" : "FAIL"}`, "", result.description, "", ...fieldRows(result), ...checkRows(result));
  }
  lines.push("", "## Expected-difference table", "", ...ledgerRows(), "");
  return lines.join("\n");
}

/** Assembles `golden-report.json` and `golden-report.md` from the per-screen results of this run. */
export function buildReports(directories: ReportDirectories = DEFAULT_DIRECTORIES): { readonly total: number; readonly failed: number } {
  const results = readResults(directories.cases).map((result) => redactRpcFields(result) as ScreenResult);
  const generatedAt = new Date().toISOString();
  mkdirSync(directories.reports, { recursive: true });
  const summary = { generatedAt, productionUrl: PRODUCTION_ORIGIN, newUrl: NEW_ORIGIN, total: results.length, failed: results.filter((result) => !result.passed).length };
  writeFileSync(
    join(directories.reports, "golden-report.json"),
    `${JSON.stringify({ ...summary, ledger: LEDGER.map(({ id, title, fields, note }) => ({ id, title, fields, note })), results }, null, 2)}\n`,
  );
  writeFileSync(join(directories.reports, "golden-report.md"), markdown(results, generatedAt));
  return { total: summary.total, failed: summary.failed };
}
