import { registryKey } from "../registry";
import type { RegistryKey } from "../types";
import type { FamilyCache, FamilyDetection } from "./types";

/**
 * Holds the promise, so concurrent callers share one detection; a promise that rejects is evicted unless it was
 * replaced first. Nothing is persisted, so a redeployed contract is probed again on the next visit.
 */
export function createFamilyCache(): FamilyCache {
  const entries = new Map<RegistryKey, Promise<FamilyDetection>>();
  return {
    get: (chainId, address) => entries.get(registryKey(chainId, address)),
    set: (chainId, address, detection) => {
      const key = registryKey(chainId, address);
      entries.set(key, detection);
      detection.catch(() => {
        if (entries.get(key) === detection) entries.delete(key);
      });
    },
  };
}
