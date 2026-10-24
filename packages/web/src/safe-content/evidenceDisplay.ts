import { REGISTRY, displayAllowlistKey, getChain, isDisplayAllowlisted, resolveDisplayUrl, resolvePublicRpcUrl } from "@dispute-resolver/core";
import type { ChainId, ChainIdField, Env } from "@dispute-resolver/core";
import type { DisplayParams, EvidenceDisplayInput, EvidenceDisplayModel, SandboxToken } from "./types";

const RELAXED_SANDBOX: readonly SandboxToken[] = ["allow-scripts", "allow-same-origin", "allow-popups", "allow-popups-to-escape-sandbox"];
const STRICT_SANDBOX: readonly SandboxToken[] = ["allow-scripts"];

function chainIdOr(field: ChainIdField, pageChainId: ChainId): ChainId {
  return field.status === "valid" ? field.chainId : pageChainId;
}

/** The RPC URL a third-party frame may receive for a chain, or `null` when none is configured. */
function publicRpcUrl(chainId: ChainId, env: Env): string | null {
  const chain = getChain(chainId);
  if (chain === undefined) return null;
  const resolution = resolvePublicRpcUrl(chain, env);
  return resolution.status === "configured" ? resolution.url : null;
}

function encodeParams(params: DisplayParams, encoding: EvidenceDisplayModel["encoding"]): string {
  if (encoding === "json") return encodeURIComponent(JSON.stringify(params));
  const entries = Object.entries(params).map(([key, value]: [string, string | number | null]) => [key, value === null ? "" : String(value)]);
  return new URLSearchParams(entries).toString();
}

/**
 * `null` when the meta-evidence names no display or its URL is not https. The relaxed sandbox is kept for allowlisted
 * arbitrables only, and never for a display served from the app's own origin.
 */
export function buildEvidenceDisplay(input: EvidenceDisplayInput): EvidenceDisplayModel | null {
  const { metaEvidence, arbitratorChainId, env } = input;
  const uri = resolveDisplayUrl(metaEvidence.evidenceDisplayInterfaceURI, input.gateway);
  if (uri === null) return null;

  const displayArbitratorChainId = chainIdOr(metaEvidence.arbitratorChainID, arbitratorChainId);
  const displayArbitrableChainId = chainIdOr(metaEvidence.arbitrableChainID, arbitratorChainId);
  // Existing displays parse this JSON query, so the key order is part of its format.
  const params: DisplayParams = {
    disputeID: input.disputeId.toString(),
    chainID: arbitratorChainId,
    arbitratorContractAddress: input.arbitrator,
    arbitratorJsonRpcUrl: publicRpcUrl(displayArbitratorChainId, env),
    arbitratorChainID: displayArbitratorChainId,
    arbitrableContractAddress: input.arbitrable,
    arbitrableChainID: displayArbitrableChainId,
    arbitrableJsonRpcUrl: publicRpcUrl(displayArbitrableChainId, env),
    jsonRpcUrl: publicRpcUrl(arbitratorChainId, env),
  };
  const version = metaEvidence.displayParamsVersion;
  const encoding = version === null || version === "0" ? "json" : "search-params";
  const src = `${uri}?${encodeParams(params, encoding)}`;
  const srcOrigin = new URL(uri).origin;

  const arbitrableChainId = metaEvidence.arbitrableChainID.status === "valid" ? metaEvidence.arbitrableChainID.chainId : undefined;
  const allowlisted = isDisplayAllowlisted(REGISTRY, displayAllowlistKey(arbitrableChainId, arbitratorChainId), input.arbitrable);
  const sandbox = allowlisted && srcOrigin !== input.appOrigin ? RELAXED_SANDBOX : STRICT_SANDBOX;

  return { src, srcOrigin, params, sandbox, encoding };
}
