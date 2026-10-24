import { parseAbsoluteUrl } from "./syntax";
import type { SelfHosts } from "./types";

/**
 * An `https:` scheme followed by `//`, the explicit authority. Without it a parser given no base reads what follows as the
 * host, but a browser resolves the same `href` (or `fetch` argument) on an https page against that page, so the two
 * disagree on where it leads.
 */
const EXPLICIT_HTTPS_AUTHORITY = /^https:\/\//i;

/**
 * True only for an absolute `https:` URL that spells its authority, so the host every check reads is the host a browser
 * goes to from any page. Protocol-relative, `http:`, `javascript:`, `data:` and authority-less `https:/host` references
 * fail.
 */
export function isSafeNavigationUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  return EXPLICIT_HTTPS_AUTHORITY.test(trimmed) && parseAbsoluteUrl(trimmed) !== null;
}

/**
 * Whether a URL points at this app: its host name equals the app's or a canonical host's, compared lowercase and exactly
 * (never as a substring), with the fully qualified spelling `resolve.kleros.io.` read as `resolve.kleros.io`.
 * Ports are ignored, so a dev server's `localhost:5173` matches its own links.
 */
export function isSelfLink(url: string, hosts: SelfHosts): boolean {
  const hostname = parseAbsoluteUrl(url.trim())?.hostname;
  if (hostname === undefined) return false;
  const target = canonicalHostname(hostname);
  return [hosts.appHost, ...hosts.canonicalHosts].some((host) => hostnameOf(host) === target);
}

export function resolveArbitrableAppLink(uri: unknown, hosts: SelfHosts): string | null {
  if (typeof uri !== "string" || !isSafeNavigationUrl(uri)) return null;
  const url = uri.trim();
  return isSelfLink(url, hosts) ? null : url;
}

function hostnameOf(host: string): string | null {
  const hostname = parseAbsoluteUrl(`https://${host.trim()}`)?.hostname;
  return hostname === undefined ? null : canonicalHostname(hostname);
}

/** The fully qualified spelling, with a final `.`, names the same DNS host. */
function canonicalHostname(hostname: string): string {
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}
