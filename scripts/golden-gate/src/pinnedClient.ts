import { createPublicClient, custom, numberToHex } from "viem";
import type { ReadClient } from "../../../packages/core/src/types";

/** Block tags that move with the chain. A pinned client replaces them with its block. */
const MOVING_TAGS: ReadonlySet<unknown> = new Set([undefined, "latest", "pending", "safe", "finalized"]);

/** The position of the block parameter of the state reads core issues. */
const BLOCK_PARAMETER_INDEX: Readonly<Record<string, number>> = {
  eth_call: 1,
  eth_getCode: 1,
  eth_getBalance: 1,
  eth_getStorageAt: 2,
  eth_getTransactionCount: 1,
};

type RawRequest = (call: { readonly method: string; readonly params?: unknown }) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pinLogFilter(filter: unknown, pinned: string): unknown {
  if (!isRecord(filter) || "blockHash" in filter) return filter;
  return {
    ...filter,
    fromBlock: filter.fromBlock !== undefined && MOVING_TAGS.has(filter.fromBlock) ? pinned : filter.fromBlock,
    toBlock: MOVING_TAGS.has(filter.toBlock) ? pinned : filter.toBlock,
  };
}

/**
 * The parameters of a JSON-RPC call with every moving block tag (`latest`, `pending`, `safe`, `finalized` or an absent
 * block) replaced by `block`, so state reads, block reads and log scans all answer as of the same block.
 */
export function pinParams(method: string, params: unknown, block: bigint): unknown {
  const pinned = numberToHex(block);
  if (!Array.isArray(params)) return params;
  const list: unknown[] = [...(params as readonly unknown[])];
  if (method === "eth_getLogs") return [pinLogFilter(list[0], pinned), ...list.slice(1)];
  if (method === "eth_getBlockByNumber") return MOVING_TAGS.has(list[0]) ? [pinned, ...list.slice(1)] : list;
  const index = BLOCK_PARAMETER_INDEX[method];
  if (index === undefined || !MOVING_TAGS.has(list[index])) return list;
  while (list.length < index) list.push(undefined);
  list[index] = pinned;
  return list;
}

/**
 * A read client answering as of `block`: `eth_blockNumber` returns it and every moving block tag is replaced by it
 * (`pinParams`). Core's reads (`listOngoingDisputes`, `lookupDispute`, `detectFamily`, log scans to the head) then
 * describe one recorded block, so the gate's outputs are reproducible at the block they record. Requests go through
 * `base`, core's read client with its retry policy.
 */
export function createPinnedClient(base: ReadClient, block: bigint): ReadClient {
  // viem types `request` per method; the pinned client forwards any method with its parameters rewritten.
  const forward = base.request as unknown as RawRequest;
  const request: RawRequest = ({ method, params }) =>
    method === "eth_blockNumber" ? Promise.resolve(numberToHex(block)) : forward({ method, params: pinParams(method, params, block) });
  return createPublicClient({ transport: custom({ request }, { key: "pinned-read-rpc", name: "Pinned read RPC", retryCount: 0 }) });
}
