import type { Env, GatewayOrigin, SelfHosts } from "@dispute-resolver/core";

/** Everything the app derives from the environment, computed once in `env/config.ts`. */
export interface AppConfig {
  /** The `REACT_APP_*` subset of `import.meta.env`, frozen; passed to every core call that takes an `Env`. */
  readonly env: Env;
  /** `REACT_APP_WALLETCONNECT_PROJECT_ID`, trimmed; `null` boots the read-only `unconfigured` wallet mode. */
  readonly walletConnectProjectId: string | null;
  /** `REACT_APP_ATLAS_URI` when it parses as an https URL, without a trailing slash; `null` makes uploads unavailable. */
  readonly atlasUri: string | null;
  readonly gateway: GatewayOrigin;
  /** The running app's host plus the registry's canonical hosts. */
  readonly selfHosts: SelfHosts;
  /** `location.origin`: an evidence display on this origin never gets `allow-same-origin`. */
  readonly appOrigin: string;
}

/** The part of `window.location` that `buildAppConfig` reads, so tests pass a plain object. */
export type AppLocation = Pick<Location, "host" | "origin">;
