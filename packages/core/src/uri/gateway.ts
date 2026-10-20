import type { Env } from "../types";
import { isSafeNavigationUrl } from "./links";
import { normalizeIpfsPath } from "./normalize";
import { hasForbiddenCharacter, IPFS_PATH_PREFIX, parseAbsoluteUrl } from "./syntax";
import type { CanonicalIpfsPath, GatewayOrigin } from "./types";

/** Spec 6.4: `REACT_APP_IPFS_GATEWAY`, or this when unset. */
const DEFAULT_GATEWAY: GatewayOrigin = "https://cdn.kleros.link";

/** The configured gateway when it is an https origin (no credentials, path, query or fragment), else the default (spec 6.4). */
export function resolveGateway(env: Env): GatewayOrigin {
  const configured = env.REACT_APP_IPFS_GATEWAY?.trim() ?? "";
  const url = parseAbsoluteUrl(configured);
  if (url === null || !isBareHttpsOrigin(url)) return DEFAULT_GATEWAY;
  const { origin } = url;
  return isGatewayOrigin(origin) ? origin : DEFAULT_GATEWAY;
}

/**
 * The gateway URL of a canonical path. The path's segments are already percent-encoded once by `normalizeIpfsPath`, so
 * they are joined as they are; encoding them again would turn `%20` into `%2520`.
 */
export function gatewayUrl(path: CanonicalIpfsPath, gateway: GatewayOrigin): string {
  return `${gateway}${path}`;
}

/**
 * An `http:` or `https:` scheme followed by `//`, the explicit authority. Without it a browser resolves the reference against
 * the current page (URI-01), so an authority-less `https:/host/ipfs/<CID>` is never re-served.
 */
const EXPLICIT_HTTP_OR_HTTPS_AUTHORITY = /^https?:\/\//i;

/**
 * D-26, MC-5: an absolute `http:` or `https:` URL with an explicit authority whose path, after dot-segment resolution,
 * begins `/ipfs/<CID>` is served from the configured https gateway instead of its own host (the T2CR display on the dead
 * `ipfs.kleros.io` host). The host, port, credentials, query and fragment are never used. The path must still pass
 * `normalizeIpfsPath`; anything else yields `null`. Never used for meta-evidence, evidence or script URIs, which must
 * already be content-addressed.
 */
export function reserveThroughGateway(url: string, gateway: GatewayOrigin): string | null {
  const trimmed = url.trim();
  if (hasForbiddenCharacter(trimmed) || !EXPLICIT_HTTP_OR_HTTPS_AUTHORITY.test(trimmed)) return null;
  const parsed = parseAbsoluteUrl(trimmed);
  if (!parsed?.pathname.startsWith(IPFS_PATH_PREFIX)) return null;
  const path = normalizeIpfsPath(parsed.pathname);
  return path === null ? null : gatewayUrl(path, gateway);
}

/**
 * Where to fetch a court policy (spec 6.4, P-17): an https URL as is, a content-addressed path through the
 * gateway, anything else `null`. Replaces today's "contains `http`" test.
 */
export function policyFetchUrl(uri: string, gateway: GatewayOrigin): string | null {
  if (isSafeNavigationUrl(uri)) return uri.trim();
  const path = normalizeIpfsPath(uri);
  return path === null ? null : gatewayUrl(path, gateway);
}

function isBareHttpsOrigin(url: URL): boolean {
  return url.protocol === "https:" && url.username === "" && url.password === "" && url.pathname === "/" && url.search === "" && url.hash === "";
}

function isGatewayOrigin(value: string): value is GatewayOrigin {
  return value.startsWith("https://");
}
