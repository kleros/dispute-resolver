import type { ReadClient } from "../../types";
import { fakeNode, type CallReply } from "../rpc/testHelpers";

export { callKey, rpcError, type CallReply as CallAnswer } from "../rpc/testHelpers";

/** A `ReadClient` answering `eth_call` from `calls`, an unknown call failing as a transport error; `requested` holds the key of every call. */
export function fakeClient(calls: ReadonlyMap<string, CallReply>): { readonly client: ReadClient; readonly requested: string[] } {
  const { client, requests } = fakeNode({ head: 0n, calls });
  return { client, requested: requests.calls };
}
