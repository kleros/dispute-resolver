import type { Env } from "@dispute-resolver/core";

/** Vite's `envPrefix` (vite.config.ts) lets only these through to the bundle; the filter below keeps the type honest as well. */
const ENV_PREFIX = "REACT_APP_";

/**
 * The `REACT_APP_*` string entries of a raw environment object, frozen. Vite's own entries (`MODE`,
 * `DEV`, `PROD`, `SSR`, `BASE_URL`) and non-string values never reach core.
 */
export function readEnv(source: Readonly<Record<string, unknown>>): Env {
  const entries = Object.entries(source).filter((entry): entry is [string, string] => entry[0].startsWith(ENV_PREFIX) && typeof entry[1] === "string");
  return Object.freeze(Object.fromEntries(entries));
}

/**
 * Every variable the app reads, each written out as `import.meta.env.NAME`: Vite inlines exactly the names spelled this
 * way, while `import.meta.env` read whole (or by a computed name) inlines every REACT_APP_* variable of the build, keys
 * of RPCs the app never uses included. env.test.ts checks this list against core's chain table.
 */
const DECLARED: Readonly<Record<string, unknown>> = {
  REACT_APP_WEB3_PROVIDER_URL: import.meta.env.REACT_APP_WEB3_PROVIDER_URL,
  REACT_APP_WEB3_XDAI_PROVIDER_URL: import.meta.env.REACT_APP_WEB3_XDAI_PROVIDER_URL,
  REACT_APP_WEB3_CHIADO_PROVIDER_URL: import.meta.env.REACT_APP_WEB3_CHIADO_PROVIDER_URL,
  REACT_APP_WEB3_SEPOLIA_PROVIDER_URL: import.meta.env.REACT_APP_WEB3_SEPOLIA_PROVIDER_URL,
  REACT_APP_UNICHAIN: import.meta.env.REACT_APP_UNICHAIN,
  REACT_APP_UNICHAIN_SEPOLIA: import.meta.env.REACT_APP_UNICHAIN_SEPOLIA,
  REACT_APP_WEB3_POLYGON_PROVIDER_URL: import.meta.env.REACT_APP_WEB3_POLYGON_PROVIDER_URL,
  REACT_APP_ARBITRUM_ONE: import.meta.env.REACT_APP_ARBITRUM_ONE,
  REACT_APP_ARBITRUM_SEPOLIA: import.meta.env.REACT_APP_ARBITRUM_SEPOLIA,
  REACT_APP_OPTIMISM_SEPOLIA: import.meta.env.REACT_APP_OPTIMISM_SEPOLIA,
  REACT_APP_BASE: import.meta.env.REACT_APP_BASE,
  REACT_APP_BASE_SEPOLIA: import.meta.env.REACT_APP_BASE_SEPOLIA,
  REACT_APP_WALLETCONNECT_PROJECT_ID: import.meta.env.REACT_APP_WALLETCONNECT_PROJECT_ID,
  REACT_APP_ATLAS_URI: import.meta.env.REACT_APP_ATLAS_URI,
  REACT_APP_IPFS_GATEWAY: import.meta.env.REACT_APP_IPFS_GATEWAY,
  REACT_APP_METAEVIDENCE_URL: import.meta.env.REACT_APP_METAEVIDENCE_URL,
};

/**
 * The one reader of `import.meta.env` in the app (a lint rule enforces it). Passed to every core call that
 * takes an `Env`. Values are RPC URLs with API keys: never log or render them.
 */
export const ENV: Env = readEnv(DECLARED);
