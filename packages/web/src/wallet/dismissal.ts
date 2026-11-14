import type { Address } from "@dispute-resolver/core";

/** Must not change: browsers already hold dismissals under this key. */
const STORAGE_KEY = "@kleros/dispute-resolver/alert/smart-contract-wallet-warning";

function storageKey(address: Address): string {
  return `${STORAGE_KEY}:${address}`;
}

/**
 * Nothing stored, unreadable storage or an unparseable value show the warning; otherwise the stored value decides
 * (`false` once dismissed).
 */
export function isWarningShown(address: Address): boolean {
  try {
    const stored = window.localStorage.getItem(storageKey(address));
    return stored === null || Boolean(JSON.parse(stored));
  } catch {
    return true;
  }
}

export function dismissWarning(address: Address): void {
  try {
    window.localStorage.setItem(storageKey(address), "false");
  } catch {
    // Storage is unavailable (private mode, quota); the warning stays dismissed for this page only.
  }
}
