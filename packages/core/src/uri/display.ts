import { gatewayUrl, reserveThroughGateway } from "./gateway";
import { isSafeNavigationUrl } from "./links";
import { normalizeIpfsPath } from "./normalize";
import type { GatewayOrigin } from "./types";

/**
 * The URL of an untrusted display or document (spec 9.4 source, D-26, MC-5, A8): a content-addressed path goes through the
 * gateway; an absolute `http:` or `https:` URL with an explicit authority whose path is `/ipfs/<CID>` is re-served through
 * the gateway; any other absolute https URL is used as is (any https host, B19 accepted); anything else is `null`.
 */
export function resolveDisplayUrl(uri: unknown, gateway: GatewayOrigin): string | null {
  if (typeof uri !== "string") return null;
  const path = normalizeIpfsPath(uri);
  if (path !== null) return gatewayUrl(path, gateway);
  const url = uri.trim();
  const reserved = reserveThroughGateway(url, gateway);
  if (reserved !== null) return reserved;
  return isSafeNavigationUrl(url) ? url : null;
}
