import type { Env } from "@dispute-resolver/core";

/** Vite's `envPrefix` (vite.config.ts) lets only these through to the bundle; the filter below keeps the type honest as well. */
const ENV_PREFIX = "REACT_APP_";

/**
 * The `REACT_APP_*` string entries of a raw environment object, frozen (ARCHITECTURE.md §4). Vite's own entries (`MODE`,
 * `DEV`, `PROD`, `SSR`, `BASE_URL`) and non-string values never reach core.
 */
export function readEnv(source: Readonly<Record<string, unknown>>): Env {
  const entries = Object.entries(source).filter((entry): entry is [string, string] => entry[0].startsWith(ENV_PREFIX) && typeof entry[1] === "string");
  return Object.freeze(Object.fromEntries(entries));
}

/**
 * The one reader of `import.meta.env` in the app (lint rule 1 of ARCHITECTURE.md §1.4). Passed to every core call that
 * takes an `Env`. Values are RPC URLs with API keys: never log or render them.
 */
export const ENV: Env = readEnv(import.meta.env);
