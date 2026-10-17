import { parseAbsoluteUrl } from "./syntax";
import type { SelfHosts } from "./types";

/**
 * An `https:` scheme followed by `//`, the explicit authority. Without it a parser given no base reads what follows as the
 * host, but a browser resolves the same `href` (or `fetch` argument) on an https page against that page: `https:/1/cases/5`
 * parses as host `0.0.0.1` yet leads to `/1/cases/5` on the app itself (URI-01).
 */
const EXPLICIT_HTTPS_AUTHORITY = /^https:\/\//i;

/**
 * True only for an absolute `https:` URL that spells its authority (A9, URI-01), so the host every check reads is the host
 * a browser goes to from any page. Protocol-relative, `http:`, `javascript:`, `data:` and authority-less `https:/host`
 * references fail.
 */
export function isSafeNavigationUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  return EXPLICIT_HTTPS_AUTHORITY.test(trimmed) && parseAbsoluteUrl(trimmed) !== null;
}

/**
 * Whether a URL points at this app (D-28): its host name equals the app's or a canonical host's, compared lowercase and
 * exactly (never as a substring), with the fully qualified spelling `resolve.kleros.io.` read as `resolve.kleros.io`.
 * Ports are ignored, so a dev server's `localhost:5173` matches its own links.
 */
export function isSelfLink(url: string, hosts: SelfHosts): boolean {
  const hostname = parseAbsoluteUrl(url.trim())?.hostname;
  if (hostname === undefined) return false;
  const target = canonicalHostname(hostname);
  return [hosts.appHost, ...hosts.canonicalHosts].some((host) => hostnameOf(host) === target);
}

/** The "Go to arbitrable application" target (spec 5.6, D-28): a safe https URL that does not point back at this app. */
export function resolveArbitrableAppLink(uri: unknown, hosts: SelfHosts): string | null {
  if (typeof uri !== "string" || !isSafeNavigationUrl(uri)) return null;
  const url = uri.trim();
  return isSelfLink(url, hosts) ? null : url;
}

/** The canonical lowercase host name of a configured host such as `resolve.kleros.io` or `localhost:5173`. */
function hostnameOf(host: string): string | null {
  const hostname = parseAbsoluteUrl(`https://${host.trim()}`)?.hostname;
  return hostname === undefined ? null : canonicalHostname(hostname);
}

/** A parsed host name without the final `.` of its fully qualified spelling, which names the same DNS host. */
function canonicalHostname(hostname: string): string {
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}
