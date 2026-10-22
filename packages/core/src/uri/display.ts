import { gatewayUrl, reserveThroughGateway } from "./gateway";
import { isSafeNavigationUrl } from "./links";
import { normalizeIpfsPath } from "./normalize";
import type { GatewayOrigin } from "./types";

/**
 * Any https host is accepted as is; only an `http(s)://<host>/ipfs/<CID>` URL is re-served through the gateway, `http:`
 * included.
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
