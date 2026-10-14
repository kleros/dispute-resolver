import { resolve } from "node:path";

/** The repository root, from this file's location (the gate runs from any working directory). */
export const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../..");

export const ENV_FILE = resolve(REPOSITORY_ROOT, ".env");

/** Generated outputs (`.gitignore`d except its README). */
export const GOLDEN_DIR = resolve(REPOSITORY_ROOT, "golden");

/** Immutable IPFS content fetched by earlier runs, keyed by canonical path. */
export const IPFS_CACHE_DIR = resolve(GOLDEN_DIR, "cache/ipfs");

export const LIVE_FILE = resolve(GOLDEN_DIR, "live.json");
export const ACCOUNTS_FILE = resolve(GOLDEN_DIR, "accounts.json");
export const REFERENCES_FILE = resolve(GOLDEN_DIR, "script-references.json");
export const GATE_LOG_JSON = resolve(GOLDEN_DIR, "gate-log.json");
export const GATE_LOG_MD = resolve(GOLDEN_DIR, "gate-log.md");

export const GATE_DIR = resolve(REPOSITORY_ROOT, "scripts/golden-gate");
export const STABLE_TIER_FILE = resolve(GATE_DIR, "data/stable-tier.json");
export const TESTNET_REALITY_FILE = resolve(GATE_DIR, "data/testnet-reality-disputes.json");
export const BROWSER_DIR = resolve(GATE_DIR, "browser");

export const WEB_DIR = resolve(REPOSITORY_ROOT, "packages/web");
export const WEB_SRC_DIR = resolve(WEB_DIR, "src");
export const WEB_DIST_DIR = resolve(WEB_DIR, "dist");
