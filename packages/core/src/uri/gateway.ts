import type { Env } from "../types";
import { isSafeNavigationUrl } from "./links";
import { normalizeIpfsPath } from "./normalize";
import { hasForbiddenCharacter, IPFS_PATH_PREFIX, parseAbsoluteUrl } from "./syntax";
import type { CanonicalIpfsPath, GatewayOrigin } from "./types";

const DEFAULT_GATEWAY: GatewayOrigin = "https://cdn.kleros.link";

export function resolveGateway(env: Env): GatewayOrigin {
  const configured = env.REACT_APP_IPFS_GATEWAY?.trim() ?? "";
  const url = parseAbsoluteUrl(configured);
  if (url === null || !isBareHttpsOrigin(url)) return DEFAULT_GATEWAY;
  const { origin } = url;
  return isGatewayOrigin(origin) ? origin : DEFAULT_GATEWAY;
}

/** The path's segments are already percent-encoded once: never re-encode them (`%20` would become `%2520`). */
export function gatewayUrl(path: CanonicalIpfsPath, gateway: GatewayOrigin): string {
  return `${gateway}${path}`;
}

/** Without the explicit `//` authority, an authority-less `https:/host/ipfs/<CID>` resolves against the current page and is never re-served. */
const EXPLICIT_HTTP_OR_HTTPS_AUTHORITY = /^https?:\/\//i;

/**
 * Some displays point at a dead IPFS host (T2CR's `ipfs.kleros.io`), so only the path is kept, and it must still pass
 * `normalizeIpfsPath`. Never used for meta-evidence, evidence or script URIs, which must already be content-addressed.
 */
export function reserveThroughGateway(url: string, gateway: GatewayOrigin): string | null {
  const trimmed = url.trim();
  if (hasForbiddenCharacter(trimmed) || !EXPLICIT_HTTP_OR_HTTPS_AUTHORITY.test(trimmed)) return null;
  const parsed = parseAbsoluteUrl(trimmed);
  if (!parsed?.pathname.startsWith(IPFS_PATH_PREFIX)) return null;
  const path = normalizeIpfsPath(parsed.pathname);
  return path === null ? null : gatewayUrl(path, gateway);
}

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
