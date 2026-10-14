import type { Env, GatewayOrigin, SelfHosts } from "@dispute-resolver/core";

/**
 * Everything the app derives from the environment, computed once in `env/config.ts` from the one reader of
 * `import.meta.env` (`env/env.ts`). See ARCHITECTURE.md §4.
 */
export interface AppConfig {
  /** The `REACT_APP_*` subset of `import.meta.env`, frozen; passed to every core call that takes an `Env`. */
  readonly env: Env;
  /** `REACT_APP_WALLETCONNECT_PROJECT_ID`, trimmed; `null` boots the read-only `unconfigured` wallet mode (ARCHITECTURE.md §2.3). */
  readonly walletConnectProjectId: string | null;
  /** `REACT_APP_ATLAS_URI` when it parses as an https URL, without a trailing slash; `null` makes uploads unavailable (D-21). */
  readonly atlasUri: string | null;
  /** `resolveGateway(env)`. */
  readonly gateway: GatewayOrigin;
  /** The running app's host plus the registry's canonical hosts (D-28). */
  readonly selfHosts: SelfHosts;
  /** `location.origin`: an evidence display on this origin never gets `allow-same-origin` (C5). */
  readonly appOrigin: string;
}

/** The part of `window.location` that `buildAppConfig` reads, so tests pass a plain object. */
export type AppLocation = Pick<Location, "host" | "origin">;
