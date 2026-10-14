import { arbitrableProxyAbi } from "../abi";
import type { ChainConfig } from "../chains/types";
import type { Hex } from "../types";
import { normalizeIpfsPath } from "../uri";
import { built, isUint256, refused } from "./build";
import type { WriteBuild } from "./types";

/**
 * `ArbitrableProxy.createDispute(extraData, metaEvidenceURI, numberOfRulingOptions)` paying the arbitration cost (spec
 * 4.5, 6.2). The meta-evidence upload result must be content-addressed and is written in canonical form (B16).
 */
export function buildCreateDisputeCall(input: {
  readonly chain: ChainConfig;
  readonly extraData: Hex;
  readonly metaEvidenceUri: string;
  readonly numberOfRulingOptions: bigint;
  readonly cost: bigint;
}): WriteBuild {
  const { chain, extraData, numberOfRulingOptions, cost } = input;
  if (chain.arbitrableProxy === undefined) return refused("no-arbitrable-proxy");
  const metaEvidenceUri = normalizeIpfsPath(input.metaEvidenceUri);
  if (metaEvidenceUri === null) return refused("not-content-addressed");
  if (!isUint256(numberOfRulingOptions)) return refused("ruling-out-of-range");
  return built({
    kind: "create-dispute",
    chainId: chain.id,
    address: chain.arbitrableProxy,
    abi: arbitrableProxyAbi,
    functionName: "createDispute",
    args: [extraData, metaEvidenceUri, numberOfRulingOptions],
    value: cost,
  });
}
