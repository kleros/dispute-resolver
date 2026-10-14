import { getRealityProxy, isScriptAllowed } from "../../../../packages/core/src/registry";
import type { Registry } from "../../../../packages/core/src/registry/types";
import type { Address, ChainId } from "../../../../packages/core/src/types";
import { normalizeIpfsPath, toCidPath } from "../../../../packages/core/src/uri";
import type { CidPath } from "../../../../packages/core/src/uri/types";

/** A meta-evidence document as parsed JSON: an object with string keys. */
export type JsonObject = Readonly<Record<string, unknown>>;

/** Where a dispute's meta-evidence leaves its dynamic script, by the gating order of spec 9.1 and A2 (core `loadMetaEvidence`). */
export type ScriptGate =
  | { readonly kind: "runs"; readonly cid: CidPath; readonly scriptUri: string; readonly metaEvidence: JsonObject }
  | { readonly kind: "skipped"; readonly reason: "not-an-object" | "no-script" | "registered-reality-proxy" }
  | { readonly kind: "refused"; readonly reason: "script-uri-not-content-addressed" | "script-not-allowlisted"; readonly scriptUri: string };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether the dispute runs its dynamic script, in core's order (`loadMetaEvidence`): a registered Reality proxy never
 * runs it (spec 10.4); a non-object or a falsy `dynamicScriptURI` has none; the URI must be content-addressed (A3) and
 * allowlisted for the arbitrator chain (A1). The old app applies the same gates in the same order (spec 9.1 step 7).
 */
export function gateScript(document: unknown, chainId: ChainId, arbitrable: Address, registry: Registry): ScriptGate {
  if (getRealityProxy(registry, chainId, arbitrable) !== undefined) return { kind: "skipped", reason: "registered-reality-proxy" };
  if (!isJsonObject(document)) return { kind: "skipped", reason: "not-an-object" };
  const scriptUri: unknown = document.dynamicScriptURI;
  // Today's `if (metaEvidenceJSON.dynamicScriptURI …)`: any falsy value means no script.
  if (!scriptUri) return { kind: "skipped", reason: "no-script" };
  if (typeof scriptUri !== "string") return { kind: "refused", reason: "script-uri-not-content-addressed", scriptUri: JSON.stringify(scriptUri) };
  const path = normalizeIpfsPath(scriptUri);
  if (path === null) return { kind: "refused", reason: "script-uri-not-content-addressed", scriptUri };
  if (!isScriptAllowed(registry, chainId, scriptUri)) return { kind: "refused", reason: "script-not-allowlisted", scriptUri };
  return { kind: "runs", cid: toCidPath(path), scriptUri, metaEvidence: document };
}
