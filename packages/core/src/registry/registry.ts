import { DISPLAY_ALLOWLIST } from "./displayAllowlist";
import { OVERRIDES } from "./overrides";
import { REALITY_PROXIES } from "./realityProxies";
import { DEFAULT_SCRIPT_CID, DYNAMIC_SCRIPT_ALLOWLIST } from "./scripts";
import { VERIFIED_ARBITRABLES } from "./verified";
import type { Registry } from "./types";

/** Its invariants are enforced by `invariants.test.ts`. */
export const REGISTRY: Registry = {
  realityProxies: REALITY_PROXIES,
  overrides: OVERRIDES,
  verifiedArbitrables: VERIFIED_ARBITRABLES,
  dynamicScriptAllowlist: DYNAMIC_SCRIPT_ALLOWLIST,
  displayAllowlist: DISPLAY_ALLOWLIST,
  defaultScriptCid: DEFAULT_SCRIPT_CID,
  canonicalHosts: ["resolve.kleros.io"],
};
