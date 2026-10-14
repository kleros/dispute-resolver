import { gatewayUrl, reserveThroughGateway } from "./gateway";
import { isSafeNavigationUrl } from "./links";
import { normalizeIpfsPath } from "./normalize";
import type { GatewayOrigin } from "./types";

/**
 * The URL of an untrusted display or document (spec 9.4 source, D-26, A8): a content-addressed path goes through the
 * gateway; an absolute https URL is re-served through the gateway when its path is `/ipfs/<CID>` and used as is
 * otherwise (any https host, B19 accepted); anything else is `null`.
 */
export function resolveDisplayUrl(uri: unknown, gateway: GatewayOrigin): string | null {
  if (typeof uri !== "string") return null;
  const path = normalizeIpfsPath(uri);
  if (path !== null) return gatewayUrl(path, gateway);
  const url = uri.trim();
  if (!isSafeNavigationUrl(url)) return null;
  return reserveThroughGateway(url, gateway) ?? url;
}
