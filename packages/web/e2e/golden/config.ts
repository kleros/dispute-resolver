import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Run configuration of the golden suite. Nothing here is printed or written to a report except the origins of the base
// URLs and the reasons for skipped fields; the `.env` file is only checked for the presence of one variable name.

export const PREVIEW_PORT = "4173";
const LOCAL_PREVIEW = `http://localhost:${PREVIEW_PORT}`;
const PRODUCTION = "https://resolve.kleros.io";

const GOLDEN_DIR = import.meta.dirname;
export const REPOSITORY_ROOT = resolve(GOLDEN_DIR, "../../../..");

export const REPORTS_DIR = resolve(GOLDEN_DIR, "reports");
export const CASE_REPORTS_DIR = resolve(REPORTS_DIR, "cases");

function baseUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  let url = trimmed === "" ? fallback : trimmed;
  while (url.endsWith("/")) url = url.slice(0, -1);
  return url;
}

/** Production, `PROD_URL` (default https://resolve.kleros.io). */
export const PROD_URL = baseUrl(process.env.PROD_URL, PRODUCTION);

/** The new app, `NEW_URL` (default the local `vite preview` that the Playwright web server starts). */
export const NEW_URL = baseUrl(process.env.NEW_URL, LOCAL_PREVIEW);

/** Whether the new app is the local preview, which the Playwright web server has to start. */
export const NEW_IS_LOCAL_PREVIEW = NEW_URL === LOCAL_PREVIEW;

/** `golden/accounts.json`, written by `yarn golden-gate accounts` (04 §1 account context); `GOLDEN_ACCOUNTS` overrides it. */
export const ACCOUNTS_FILE = resolve(REPOSITORY_ROOT, process.env.GOLDEN_ACCOUNTS ?? "golden/accounts.json");

const WALLET_VARIABLE = "REACT_APP_WALLETCONNECT_PROJECT_ID";

/** Whether `.env` defines `name` with a non-empty value; the value itself is never read into a variable. */
function dotEnvDefines(name: string): boolean {
  const file = resolve(REPOSITORY_ROOT, ".env");
  if (!existsSync(file)) return false;
  const pattern = new RegExp(`^\\s*${name}\\s*=\\s*\\S`, "m");
  return pattern.test(readFileSync(file, "utf8"));
}

/**
 * Why the new app cannot show account-dependent fields, or `null` when it can. Without
 * `REACT_APP_WALLETCONNECT_PROJECT_ID` it connects no wallet at all (K-02). For a remote `NEW_URL` the build's setting is
 * unknown, so `GOLDEN_NEW_WALLET=configured` declares it.
 */
export function newAppWalletUnavailableReason(): string | null {
  const declared = process.env.GOLDEN_NEW_WALLET?.trim();
  if (declared === "configured") return null;
  if (declared === "unconfigured") return `${WALLET_VARIABLE} is unset in the new app's build (GOLDEN_NEW_WALLET=unconfigured), so it connects no wallet (K-02)`;
  const configured = NEW_IS_LOCAL_PREVIEW ? (process.env[WALLET_VARIABLE]?.trim() ?? "") !== "" || dotEnvDefines(WALLET_VARIABLE) : false;
  if (configured) return null;
  return NEW_IS_LOCAL_PREVIEW
    ? `${WALLET_VARIABLE} is unset for the local build, so the new app connects no wallet (K-02)`
    : `the wallet setting of ${new URL(NEW_URL).origin} is unknown; set GOLDEN_NEW_WALLET=configured when its build has ${WALLET_VARIABLE} (K-02)`;
}

/** How long one app may take to settle a case page: the meta-evidence budget plus the dispute reads (D-38). */
export const CASE_SETTLE_MS = 180_000;
/** The Ongoing page loads every open dispute (D-37); production can take minutes. */
export const ONGOING_SETTLE_MS = 300_000;
export const CREATE_SETTLE_MS = 120_000;
