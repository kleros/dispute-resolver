/**
 * Test-only fake node for the create module: answers `eth_call` from a map keyed by target and calldata, with viem's
 * retries off so every request reaches the node once.
 */
import { createPublicClient, custom } from "viem";
import type { Hex, ReadClient } from "../../types";
import { callKey, rpcError } from "../rpc/testHelpers";

export { callKey, rpcError } from "../rpc/testHelpers";

/** The answer to one `eth_call`: raw return data, or the error the node or transport raised. */
export type CallAnswer = { readonly result: Hex } | { readonly error: Error };

/** A `ReadClient` answering `eth_call` from `calls`; any other request, or an unknown call, is rejected. */
export function fakeClient(calls: ReadonlyMap<string, CallAnswer>): { readonly client: ReadClient; readonly requested: string[] } {
  const requested: string[] = [];
  const request = ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    if (method !== "eth_call") return Promise.reject(rpcError(-32601, `unexpected method ${method}`));
    const [{ to, data }] = params as [{ to: string; data: Hex }];
    const key = callKey(to, data);
    requested.push(key);
    const found = calls.get(key);
    if (found === undefined) return Promise.reject(rpcError(-32099, `no answer recorded for ${key}`));
    return "error" in found ? Promise.reject(found.error) : Promise.resolve(found.result);
  };
  return { client: createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }), requested };
}
