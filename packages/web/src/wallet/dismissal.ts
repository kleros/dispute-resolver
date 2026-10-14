import type { Address } from "@dispute-resolver/core";

/** Today's key, kept so a warning dismissed in the old app stays dismissed (spec §6.5). */
const STORAGE_KEY = "@kleros/dispute-resolver/alert/smart-contract-wallet-warning";

function storageKey(address: Address): string {
  return `${STORAGE_KEY}:${address}`;
}

/**
 * Whether the warning should show for `address` (spec §2.3): nothing stored, unreadable storage or an unparseable value
 * show it; otherwise the stored value decides, as today (`false` once dismissed).
 */
export function isWarningShown(address: Address): boolean {
  try {
    const stored = window.localStorage.getItem(storageKey(address));
    return stored === null || Boolean(JSON.parse(stored));
  } catch {
    return true;
  }
}

/** Stores the dismissal for `address`; a storage failure only means the warning returns next time. */
export function dismissWarning(address: Address): void {
  try {
    window.localStorage.setItem(storageKey(address), "false");
  } catch {
    // Storage is unavailable (private mode, quota); the warning stays dismissed for this page only.
  }
}
