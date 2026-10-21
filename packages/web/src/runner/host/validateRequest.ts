import { JSON_DUPLICATE_KEY_GUARD, parseChainId, z, type ScriptRunRequest } from "@dispute-resolver/core";
import { PROTOCOL_VERSION, RUN_MESSAGE_TYPE } from "../protocol";
import type { RpcRedirectRule, RunnerRequestMessage } from "../types";
import { isHttpsUrl } from "./httpsUrl";

// B5: the host re-checks the parameters core built before any frame exists, so nothing malformed reaches a script.
const configuredChainId = z.number().refine((id) => parseChainId(id) === id);
const rpcUrl = z.union([z.null(), z.string().refine(isHttpsUrl)]);

const runRequestSchema = z.object({
  scriptText: z.string(),
  kind: z.enum(["reality", "standard"]),
  params: z.object({
    disputeID: z.string().regex(/^(?:0|[1-9]\d*)$/),
    arbitrableContractAddress: z.string().regex(/^0x[0-9a-f]{40}$/),
    arbitratorChainID: configuredChainId,
    arbitrableChainID: configuredChainId,
    arbitratorJsonRpcUrl: rpcUrl,
    arbitrableJsonRpcUrl: rpcUrl,
  }),
});

/**
 * The message to post for `request`, or `undefined` when its parameters or script text are invalid (B5). The
 * parameters are copied field by field, so only the six of spec §9.5 reach the script.
 */
export function buildRequestMessage(request: ScriptRunRequest, rpcRedirects: readonly RpcRedirectRule[]): RunnerRequestMessage | undefined {
  if (!runRequestSchema.safeParse(request).success) return;
  const { scriptText, params, kind } = request;
  return {
    type: RUN_MESSAGE_TYPE,
    version: PROTOCOL_VERSION,
    scriptText,
    params: {
      disputeID: params.disputeID,
      arbitrableContractAddress: params.arbitrableContractAddress,
      arbitratorChainID: params.arbitratorChainID,
      arbitrableChainID: params.arbitrableChainID,
      arbitratorJsonRpcUrl: params.arbitratorJsonRpcUrl,
      arbitrableJsonRpcUrl: params.arbitrableJsonRpcUrl,
    },
    guardSource: kind === "reality" ? JSON_DUPLICATE_KEY_GUARD : null,
    rpcRedirects,
  };
}
