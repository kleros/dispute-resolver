import { getChain, resolvePublicRpcUrl } from "../chains";
import type { Address, ChainId, Env, Outcome, ScriptParameters } from "../types";
import type { ChainIdField, MetaEvidence } from "./types";

/** The chain a script parameter names: the meta-evidence value when valid, the arbitrator chain when absent (spec 9.5). */
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

/** The only RPC URL a script may see (D-35): the chain's public setting, defaulting to its read RPC; `null` without one. */
function publicRpcUrl(chainId: ChainId, env: Env): string | null {
  const chain = getChain(chainId);
  if (chain === undefined) return null;
  const resolution = resolvePublicRpcUrl(chain, env);
  return resolution.status === "configured" ? resolution.url : null;
}

/**
 * The parameters given to a dynamic script (spec 9.5, B5, D-35). `arbitratorChainID` and `arbitrableChainID` default to
 * the arbitrator chain when absent; a present value that is not an integer naming a configured chain (`"1</script>"`,
 * `"1.0"`, Optimism's 10) fails with `no-rpc`, and the script is not run (B5, D-18, MODULES.md choice 6). The RPC URLs
 * are each chain's public setting, `null` when the chain has none. The arbitrable is the arbitrator's (A22).
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
      error: { code: "no-rpc", message: "The dynamic script was not run: the meta-evidence names a chain ID that is not a configured chain, so no RPC is configured for it." },
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
