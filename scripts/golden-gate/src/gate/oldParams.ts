import type { Registry } from "../../../../packages/core/src/registry/types";
import type { Env } from "../../../../packages/core/src/types";

// Test-harness transcription of the old runner's inputs (spec 9.5; today's src/app.js processDynamicScript,
// src/utils/utils.js and src/ethereum/network-contract-mapping.js). Never imported by packages/web/src (C9).

/** The parameters the old app embedded in the frame, in its key order, with its value types (spec 9.5). */
export interface OldScriptParameters {
  readonly arbitratorChainID: unknown;
  readonly arbitrableChainID: unknown;
  readonly disputeID: string;
  readonly arbitrableContractAddress: string;
  readonly arbitratorJsonRpcUrl: string | undefined;
  readonly arbitrableJsonRpcUrl: string | undefined;
}

export type OldParametersResult = { readonly ok: true; readonly params: OldScriptParameters } | { readonly ok: false; readonly detail: string };

/** Today's `networkMap[chainId].WEB3_PROVIDER`: the variable each chain reads, or the literal URL of the zkSync chains. */
const OLD_READ_RPC: Readonly<Record<number, { readonly env: string } | { readonly literal: string }>> = {
  1: { env: "REACT_APP_WEB3_PROVIDER_URL" },
  5: { env: "REACT_APP_WEB3_GOERLI_PROVIDER_URL" },
  100: { env: "REACT_APP_WEB3_XDAI_PROVIDER_URL" },
  130: { env: "REACT_APP_UNICHAIN" },
  1301: { env: "REACT_APP_UNICHAIN_SEPOLIA" },
  137: { env: "REACT_APP_WEB3_POLYGON_PROVIDER_URL" },
  300: { literal: "https://sepolia.era.zksync.dev/" },
  324: { literal: "https://mainnet.era.zksync.io" },
  690: { env: "REACT_APP_REDSTONE" },
  42161: { env: "REACT_APP_ARBITRUM_ONE" },
  421614: { env: "REACT_APP_ARBITRUM_SEPOLIA" },
  80001: { env: "REACT_APP_WEB3_MUMBAI_PROVIDER_URL" },
  10200: { env: "REACT_APP_WEB3_CHIADO_PROVIDER_URL" },
  11155111: { env: "REACT_APP_WEB3_SEPOLIA_PROVIDER_URL" },
  11155420: { env: "REACT_APP_OPTIMISM_SEPOLIA" },
  8453: { env: "REACT_APP_BASE" },
  84532: { env: "REACT_APP_BASE_SEPOLIA" },
};

/**
 * Today's `getReadOnlyRpcUrl({ chainId })`: `map[parseInt(chainId)].WEB3_PROVIDER`. A chain absent from the map makes
 * it throw (a TypeError on `undefined.WEB3_PROVIDER`); a mapped chain whose variable is unset yields `undefined`.
 */
export function oldReadOnlyRpcUrl(chainId: unknown, env: Env): { readonly ok: true; readonly url: string | undefined } | { readonly ok: false } {
  // `parseInt(chainId)` without a radix, as today: "0x64" reads as 100, "1abc" as 1.
  const entry = OLD_READ_RPC[Number.parseInt(String(chainId))];
  if (entry === undefined) return { ok: false };
  return { ok: true, url: "env" in entry ? env[entry.env] : entry.literal };
}

/**
 * Today's `field || chainID` (spec 9.5): every falsy value (0, "", null, false, NaN) falls back to the network, not
 * only a missing one, so the default is a truthiness test rather than a nullish one.
 */
function falsyDefault(value: unknown, network: string): unknown {
  if (value) return value;
  return network;
}

/**
 * The parameters today's `processDynamicScript` builds (spec 9.5): each chain ID is the meta-evidence value when truthy,
 * else the network as the string the app keeps in its state; the arbitrable is ethers' checksummed address; the RPC
 * URLs come from `getReadOnlyRpcUrl`, whose throw for an unmapped chain fails the attempt before the script runs.
 */
export function buildOldScriptParameters(input: {
  readonly chainIdFields: Readonly<Partial<Record<"arbitratorChainID" | "arbitrableChainID", unknown>>>;
  readonly chainId: number;
  readonly disputeId: number;
  readonly arbitrableChecksummed: string;
  readonly env: Env;
}): OldParametersResult {
  const network = String(input.chainId);
  const arbitratorChainID = falsyDefault(input.chainIdFields.arbitratorChainID, network);
  const arbitrableChainID = falsyDefault(input.chainIdFields.arbitrableChainID, network);
  const arbitratorRpc = oldReadOnlyRpcUrl(arbitratorChainID, input.env);
  if (!arbitratorRpc.ok) return { ok: false, detail: `getReadOnlyRpcUrl throws for arbitratorChainID ${JSON.stringify(arbitratorChainID)}` };
  const arbitrableRpc = oldReadOnlyRpcUrl(arbitrableChainID, input.env);
  if (!arbitrableRpc.ok) return { ok: false, detail: `getReadOnlyRpcUrl throws for arbitrableChainID ${JSON.stringify(arbitrableChainID)}` };
  return {
    ok: true,
    params: {
      arbitratorChainID,
      arbitrableChainID,
      disputeID: String(input.disputeId),
      arbitrableContractAddress: input.arbitrableChecksummed,
      arbitratorJsonRpcUrl: arbitratorRpc.url,
      arbitrableJsonRpcUrl: arbitrableRpc.url,
    },
  };
}

/**
 * The old frame's `sandbox` value: the `iframe` package joins `["allow-scripts", flag]` with a space, the flag being
 * `allow-same-origin` exactly when today's arbitrable allowlist (core's `displayAllowlist`, its unchanged transcription)
 * lists the lowercased arbitrable under the `arbitrableChainID` parameter, else `undefined`, which joins as "".
 */
export function oldSandboxValue(params: OldScriptParameters, registry: Registry): string {
  const key = String(params.arbitrableChainID);
  const listed = Object.hasOwn(registry.displayAllowlist, key) ? registry.displayAllowlist[Number(key)] : undefined;
  const arbitrable = params.arbitrableContractAddress.toLowerCase();
  const flag = listed?.some((address) => address === arbitrable) === true ? "allow-same-origin" : undefined;
  return ["allow-scripts", flag].join(" ");
}

/**
 * Today's redirect map (spec 9.5, `RPCS_TO_REDIRECT`): the hard-coded Infura URL, read from today's source by
 * `loadLegacyRedirectUrl`, to chain 1's read RPC, only when that RPC is set.
 */
export function oldRedirectMap(env: Env, legacyRedirectUrl: string): Readonly<Record<string, string>> {
  const target = oldReadOnlyRpcUrl("1", env);
  return target.ok && target.url ? { [legacyRedirectUrl]: target.url } : {};
}
