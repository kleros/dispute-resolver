import { getChain, resolvePublicRpcUrl } from "../chains";
import type { Address, ChainId, Env, Outcome, ScriptParameters } from "../types";
import type { ChainIdField, MetaEvidence } from "./types";

function parameterChain(field: ChainIdField, arbitratorChainId: ChainId): ChainId | undefined {
  switch (field.status) {
    case "absent":
      return arbitratorChainId;
    case "valid":
      return field.chainId;
    case "invalid":
      return undefined;
  }
}

/** The only RPC URL a script may see: the chain's public setting, defaulting to its read RPC. */
function publicRpcUrl(chainId: ChainId, env: Env): string | null {
  const chain = getChain(chainId);
  if (chain === undefined) return null;
  const resolution = resolvePublicRpcUrl(chain, env);
  return resolution.status === "configured" ? resolution.url : null;
}

/**
 * A present chain ID that is not an integer naming a configured chain (`"1.0"`, Optimism's 10) fails
 * with `no-rpc`, and the script is not run. The arbitrable must be the arbitrator's, never one the meta-evidence names.
 */
export function buildScriptParameters(input: {
  readonly metaEvidence: MetaEvidence;
  readonly arbitratorChainId: ChainId;
  readonly disputeId: bigint;
  readonly arbitrable: Address;
  readonly env: Env;
}): Outcome<ScriptParameters> {
  const { metaEvidence, arbitratorChainId, env } = input;
  const arbitratorChainID = parameterChain(metaEvidence.arbitratorChainID, arbitratorChainId);
  const arbitrableChainID = parameterChain(metaEvidence.arbitrableChainID, arbitratorChainId);
  if (arbitratorChainID === undefined || arbitrableChainID === undefined) {
    return {
      ok: false,
      error: { code: "no-rpc", message: "The meta-evidence names a network whose details are unavailable, so its dynamic script did not run." },
    };
  }
  return {
    ok: true,
    value: {
      disputeID: input.disputeId.toString(),
      arbitrableContractAddress: input.arbitrable,
      arbitratorChainID,
      arbitrableChainID,
      arbitratorJsonRpcUrl: publicRpcUrl(arbitratorChainID, env),
      arbitrableJsonRpcUrl: publicRpcUrl(arbitrableChainID, env),
    },
  };
}
