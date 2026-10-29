import type { Address, RegistryKey } from "../types";
import { normalizeIpfsPath, toCidPath } from "../uri";
import type { BehaviorOverride, Registry, RealityProxyEntry } from "./types";

/** `"<arbitrator chain ID>:<lowercase arbitrable>"`, the key of every registry table. */
export function registryKey(chainId: number, address: Address): RegistryKey {
  // The cast is sound: a number's decimal string is a `${number}`.
  return `${chainId.toString() as `${number}`}:${address}`;
}

export function getRealityProxy(registry: Registry, chainId: number, arbitrable: Address): RealityProxyEntry | undefined {
  return registry.realityProxies[registryKey(chainId, arbitrable)];
}

export function getOverride(registry: Registry, chainId: number, arbitrable: Address): BehaviorOverride | undefined {
  return registry.overrides[registryKey(chainId, arbitrable)];
}

/**
 * The normalized CID path must exactly match an entry listed under the arbitrator chain. Callers must fetch the script
 * from the normalized path, never from the raw URI.
 */
export function isScriptAllowed(registry: Registry, arbitratorChainId: number, scriptUri: unknown): boolean {
  const path = normalizeIpfsPath(scriptUri);
  if (path === null) return false;
  return registry.dynamicScriptAllowlist[arbitratorChainId]?.includes(toCidPath(path)) ?? false;
}

/** Display flags only: no role in scripts or families. The key is the meta-evidence's `displayChainId`. */
export function isDisplayAllowlisted(registry: Registry, key: number, arbitrable: Address): boolean {
  return registry.displayAllowlist[key]?.includes(arbitrable) ?? false;
}
