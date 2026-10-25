import { REGISTRY, resolveGateway, withoutTrailingSlashes } from "@dispute-resolver/core";
import type { Env } from "@dispute-resolver/core";
import { ENV } from "./env";
import type { AppConfig, AppLocation } from "./types";

/** `REACT_APP_WALLETCONNECT_PROJECT_ID`, trimmed; empty or unset is `null` and boots the read-only wallet mode. */
function readWalletConnectProjectId(env: Env): string | null {
  const projectId = env.REACT_APP_WALLETCONNECT_PROJECT_ID?.trim() ?? "";
  return projectId === "" ? null : projectId;
}

/**
 * `REACT_APP_ATLAS_URI` is accepted only as an `https:` URL without credentials, query or fragment (the upload and
 * sign-in endpoints are appended to it); a path is kept, trailing slashes are dropped. Anything else, including an unset
 * variable, is `null` and uploads are shown as unavailable. Never throws.
 */
function readAtlasUri(env: Env): string | null {
  const configured = env.REACT_APP_ATLAS_URI?.trim() ?? "";
  if (configured === "") return null;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return null;
  return `${url.origin}${withoutTrailingSlashes(url.pathname)}`;
}

/**
 * Derives the app configuration from an environment and the page location. Pure and total: a missing or malformed
 * variable yields a `null` field, never an exception, so the app always boots.
 */
export function buildAppConfig(env: Env, location: AppLocation): AppConfig {
  return Object.freeze({
    env,
    walletConnectProjectId: readWalletConnectProjectId(env),
    atlasUri: readAtlasUri(env),
    gateway: resolveGateway(env),
    selfHosts: Object.freeze({ appHost: location.host, canonicalHosts: REGISTRY.canonicalHosts }),
    appOrigin: location.origin,
  });
}

/** Computed once at module load from the real environment and `window.location`. */
export const APP_CONFIG: AppConfig = buildAppConfig(ENV, window.location);
