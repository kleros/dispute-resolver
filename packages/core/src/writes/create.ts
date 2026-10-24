import { arbitrableProxyAbi } from "../abi";
import type { ChainConfig } from "../chains/types";
import type { Hex } from "../types";
import { normalizeIpfsPath } from "../uri";
import { isUint256 } from "../rulings";
import { built, refused } from "./build";
import type { WriteBuild } from "./types";

/** The meta-evidence upload result must be content-addressed and is written in canonical form. */
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
