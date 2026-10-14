import { DISPLAY_ALLOWLIST } from "./displayAllowlist";
import { OVERRIDES } from "./overrides";
import { REALITY_PROXIES } from "./realityProxies";
import { DEFAULT_SCRIPT_CID, DYNAMIC_SCRIPT_ALLOWLIST } from "./scripts";
import type { Registry } from "./types";

/** The registry of 06 §2. Invariants are enforced by the tests of this module (06 §3). */
export const REGISTRY: Registry = {
  realityProxies: REALITY_PROXIES,
  overrides: OVERRIDES,
  dynamicScriptAllowlist: DYNAMIC_SCRIPT_ALLOWLIST,
  displayAllowlist: DISPLAY_ALLOWLIST,
  defaultScriptCid: DEFAULT_SCRIPT_CID,
  canonicalHosts: ["resolve.kleros.io"],
};
