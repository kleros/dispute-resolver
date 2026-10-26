import { publicRpcUrl } from "../chains";
import { fail, succeed } from "../outcome";
import type { Address, Env, Outcome, ScriptParameters } from "../types";
import type { ChainIdField, MetaEvidence } from "./types";

function parameterChain(field: ChainIdField, arbitratorChainId: number): number | undefined {
  switch (field.status) {
    case "absent":
      return arbitratorChainId;
    case "valid":
      return field.chainId;
    case "invalid":
      return undefined;
  }
}

/**
 * A present chain ID that is not an integer naming a configured chain (`"1.0"`, Optimism's 10) fails
 * with `no-rpc`, and the script is not run. The arbitrable must be the arbitrator's, never one the meta-evidence names.
 */
export function buildScriptParameters(input: {
  readonly metaEvidence: MetaEvidence;
  readonly arbitratorChainId: number;
  readonly disputeId: bigint;
  readonly arbitrable: Address;
  readonly env: Env;
}): Outcome<ScriptParameters> {
  const { metaEvidence, arbitratorChainId, env } = input;
  const arbitratorChainID = parameterChain(metaEvidence.arbitratorChainID, arbitratorChainId);
  const arbitrableChainID = parameterChain(metaEvidence.arbitrableChainID, arbitratorChainId);
  if (arbitratorChainID === undefined || arbitrableChainID === undefined) {
    return fail("no-rpc", "The meta-evidence names a network whose details are unavailable, so its dynamic script did not run.");
  }
  return succeed({
    disputeID: input.disputeId.toString(),
    arbitrableContractAddress: input.arbitrable,
    arbitratorChainID,
    arbitrableChainID,
    arbitratorJsonRpcUrl: publicRpcUrl(arbitratorChainID, env),
    arbitrableJsonRpcUrl: publicRpcUrl(arbitrableChainID, env),
  });
}
