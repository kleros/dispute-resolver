import { existsSync, readFileSync } from "node:fs";
import { ACCOUNTS_FILE } from "./config";
import { caseKey } from "./stableTier";

// The account context of 04 §1: the first contributor of each case, from `golden/accounts.json`
// (`yarn golden-gate accounts`). The file is generated and ignored by git; a case missing from it runs with no account.

export interface AccountContext {
  /** The account to announce, lowercase, or `null` when the case runs without one. */
  readonly account: string | null;
  /** Why no account is used, when `account` is `null`. */
  readonly reason: string | null;
}

interface AccountsEntry {
  readonly key: string;
  readonly account: string | null;
  readonly reason: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function entryReason(record: unknown): string | null {
  if (!isRecord(record)) return null;
  const { reason, status } = record;
  if (typeof reason === "string") return reason;
  return typeof status === "string" ? status : null;
}

function parseEntry(value: unknown): AccountsEntry | null {
  if (!isRecord(value) || typeof value.key !== "string") return null;
  const account = typeof value.account === "string" && /^0x[0-9a-fA-F]{40}$/.test(value.account) ? value.account.toLowerCase() : null;
  return { key: value.key, account, reason: entryReason(value.record) };
}

let cached: ReadonlyMap<string, AccountsEntry> | null | undefined;

function loadEntries(): ReadonlyMap<string, AccountsEntry> | null {
  if (cached !== undefined) return cached;
  if (!existsSync(ACCOUNTS_FILE)) {
    cached = null;
    return cached;
  }
  const parsed: unknown = JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8"));
  const entries = isRecord(parsed) && Array.isArray(parsed.entries) ? (parsed.entries as unknown[]) : [];
  cached = new Map(
    entries
      .map(parseEntry)
      .filter((entry): entry is AccountsEntry => entry !== null)
      .map((entry) => [entry.key, entry]),
  );
  return cached;
}

/** The account context of one case. */
export function accountFor(chainId: number, disputeId: number): AccountContext {
  const entries = loadEntries();
  if (entries === null) return { account: null, reason: "golden/accounts.json is missing; run `yarn golden-gate accounts` to give contributed cases an account" };
  const entry = entries.get(caseKey(chainId, disputeId));
  if (entry === undefined) return { account: null, reason: "the case is not in golden/accounts.json" };
  if (entry.account === null) return { account: null, reason: `no contributor (${entry.reason ?? "no Contribution event"})` };
  return { account: entry.account, reason: null };
}
