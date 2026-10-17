import { createPublicClient, custom, pad } from "viem";
import { EIP1967_IMPLEMENTATION_SLOT } from "../../abi";
import type { Address, ChainId, Hex, ReadClient } from "../../types";
import { RECORDED_CONTRACTS } from "../../families/__fixtures__/recorded";

/** A JSON-RPC error as a node reports it: an `Error` with a numeric `code`. */
export function rpcError(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** One JSON-RPC request the fake node received. */
export interface NodeCall {
  readonly method: string;
  readonly params: readonly unknown[];
}

/**
 * The state of a fake node: code and EIP-1967 slot words by lowercase address, an optional failure per request, and
 * the requests answered with neither `result` nor `error` (as a misbehaving load balancer in front of a node may).
 */
export interface FakeNode {
  readonly code: Readonly<Record<string, Hex>>;
  readonly implementationSlot?: Readonly<Record<string, Hex>>;
  readonly fail?: (call: NodeCall) => Error | undefined;
  readonly noResult?: (call: NodeCall) => boolean;
}

const ZERO_WORD: Hex = pad("0x", { size: 32 });

/** The EIP-1967 slot word of a proxy pointing at `implementation`. */
export function slotWord(implementation: Address): Hex {
  return pad(implementation, { size: 32 });
}

function lowercaseParam(params: readonly unknown[], index: number): string {
  const value = params[index];
  if (typeof value !== "string") throw rpcError(-32602, "invalid params");
  return value.toLowerCase();
}

/**
 * A `ReadClient` over a fake node answering `eth_getCode` and `eth_getStorageAt` only; any other method fails, so a
 * test sees an `eth_call` as an error. viem's retries are off so each request reaches the node once. Every request is
 * recorded in `calls`.
 */
export function fakeNodeClient(node: FakeNode): { readonly client: ReadClient; readonly calls: NodeCall[] } {
  const calls: NodeCall[] = [];
  const request = ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    const call: NodeCall = { method, params: Array.isArray(params) ? (params as unknown[]) : [] };
    calls.push(call);
    const failure = node.fail?.(call);
    if (failure !== undefined) return Promise.reject(failure);
    if (node.noResult?.(call) === true) return Promise.resolve(undefined);
    if (method === "eth_getCode") return Promise.resolve(node.code[lowercaseParam(call.params, 0)] ?? "0x");
    if (method === "eth_getStorageAt") {
      const isImplementationSlot = lowercaseParam(call.params, 1) === EIP1967_IMPLEMENTATION_SLOT;
      const word = isImplementationSlot ? node.implementationSlot?.[lowercaseParam(call.params, 0)] : undefined;
      return Promise.resolve(word ?? ZERO_WORD);
    }
    return Promise.reject(rpcError(-32601, `unexpected method ${method}`));
  };
  return { client: createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }), calls };
}

/** A fake node holding the recorded code of every fixture contract of `chainId`, implementations included. */
export function recordedNode(chainId: ChainId): { code: Record<string, Hex>; implementationSlot: Record<string, Hex> } {
  const code: Record<string, Hex> = {};
  const implementationSlot: Record<string, Hex> = {};
  for (const contract of RECORDED_CONTRACTS.filter((candidate) => candidate.chainId === chainId)) {
    code[contract.address] = contract.code;
    if (contract.implementation !== null) {
      implementationSlot[contract.address] = slotWord(contract.implementation.address);
      code[contract.implementation.address] = contract.implementation.code;
    }
  }
  return { code, implementationSlot };
}

/** The `eth_getCode` targets among `calls`, lowercase. */
export function codeReads(calls: readonly NodeCall[]): string[] {
  return calls.filter((call) => call.method === "eth_getCode").map((call) => lowercaseParam(call.params, 0));
}
