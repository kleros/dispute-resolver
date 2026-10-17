import { parseChainId } from "../chains";
import type { Address, ChainId, RegistryKey } from "../types";
import { normalizeIpfsPath, toCidPath } from "../uri";
import type { BehaviorOverride, Registry, RealityProxyEntry } from "./types";

/** `"<arbitrator chain ID>:<lowercase arbitrable>"`, the key of every registry table (06 §2). */
export function registryKey(chainId: ChainId, address: Address): RegistryKey {
  // The cast is sound: a number's decimal string is a `${number}`.
  return `${chainId.toString() as `${number}`}:${address}`;
}

/** The registered Reality.eth proxy entry of an arbitrable on an arbitrator chain, if any (ADR 0003 row 1). */
export function getRealityProxy(registry: Registry, chainId: ChainId, arbitrable: Address): RealityProxyEntry | undefined {
  return registry.realityProxies[registryKey(chainId, arbitrable)];
}

/** The behavior override of an arbitrable on an arbitrator chain, if any (ADR 0003 layer two). */
export function getOverride(registry: Registry, chainId: ChainId, arbitrable: Address): BehaviorOverride | undefined {
  return registry.overrides[registryKey(chainId, arbitrable)];
}

/**
 * Whether a dispute of the arbitrator chain may run the dynamic script named by `scriptUri` (A1): the URI is normalized
 * by the one content-addressing rule and its CID path must exactly match an entry listed under that chain. A chain
 * without a list rejects every script. Callers must fetch the script from the normalized path, never from the raw URI.
 */
export function isScriptAllowed(registry: Registry, arbitratorChainId: ChainId, scriptUri: unknown): boolean {
  const path = normalizeIpfsPath(scriptUri);
  if (path === null) return false;
  return registry.dynamicScriptAllowlist[arbitratorChainId]?.includes(toCidPath(path)) ?? false;
}

/**
 * The key under which a dispute's evidence-display flags are looked up (B6, D-34): the meta-evidence `arbitrableChainID`
 * when it is an integer naming a configured chain, else the arbitrator chain.
 */
export function displayAllowlistKey(metaEvidenceArbitrableChainId: unknown, arbitratorChainId: ChainId): ChainId {
  return parseChainId(metaEvidenceArbitrableChainId) ?? arbitratorChainId;
}

/** Whether the arbitrable is on the display allowlist under `key`. Display flags only: no role in scripts or families. */
export function isDisplayAllowlisted(registry: Registry, key: ChainId, arbitrable: Address): boolean {
  return registry.displayAllowlist[key]?.includes(arbitrable) ?? false;
}
