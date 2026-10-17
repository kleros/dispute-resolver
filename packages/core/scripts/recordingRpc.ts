/**
 * Raw JSON-RPC access for the fixture recorders: the chain's read RPC from the repository's `.env` (the environment
 * winning), answers kept exactly as the node sent them. Operator tooling: reads `process.env`, and never prints an RPC URL
 * (they carry API keys), so every failure is reported by reason only.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getChain, resolveReadRpcUrl } from "../src/chains";
import type { ChainId, Hex } from "../src/types";

const ENV_FILE = resolve(import.meta.dirname, "../../../.env");

/** A node's JSON-RPC error, as recorded in a fixture. */
export interface NodeError {
  readonly code: number;
  readonly message: string;
}

/** The answer of one `eth_call`: raw return data, or the node's error (a revert). */
export type RecordedReply = { readonly result: Hex } | { readonly error: NodeError };

/** Loads the repository's `.env` when present; variables already in the environment win. */
export function loadRepositoryEnv(): void {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

function isNodeError(value: unknown): value is NodeError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value && typeof value.code === "number" && typeof value.message === "string";
}

/** A client of one chain's read RPC. */
export interface RawRpc {
  /** The `result` of a JSON-RPC request; a node error becomes a thrown `Error` carrying the node's message only. */
  request(method: string, params: readonly unknown[]): Promise<unknown>;
  /** The raw reply of an `eth_call` at `block`: the node's revert is a value, a transport failure is thrown. */
  call(to: string, data: Hex, block: bigint): Promise<RecordedReply>;
}

/** A client of the read RPC of `chainId`. Throws, naming the chain only, when it has none configured. */
export function rawRpcFor(chainId: ChainId): RawRpc {
  const chain = getChain(chainId);
  if (chain === undefined) throw new Error(`Chain ${String(chainId)} is not in the chain table.`);
  const resolution = resolveReadRpcUrl(chain, process.env);
  if (resolution.status !== "configured") throw new Error(`Chain ${String(chainId)} has no read RPC configured (${chain.readRpcEnv ?? "no variable"}).`);
  const { url } = resolution;

  async function exchange(method: string, params: readonly unknown[]): Promise<{ result?: unknown; error?: unknown }> {
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    } catch {
      throw new Error(`${method} on chain ${String(chainId)}: the read RPC is unreachable.`);
    }
    if (!response.ok) throw new Error(`${method} on chain ${String(chainId)}: the read RPC answered HTTP ${String(response.status)}.`);
    return (await response.json()) as { result?: unknown; error?: unknown };
  }

  return {
    async request(method, params) {
      const body = await exchange(method, params);
      if (isNodeError(body.error)) throw new Error(`${method} on chain ${String(chainId)}: ${body.error.message}`);
      return body.result;
    },
    async call(to, data, block) {
      const body = await exchange("eth_call", [{ to, data }, `0x${block.toString(16)}`]);
      if (isNodeError(body.error)) return { error: { code: body.error.code, message: body.error.message } };
      if (typeof body.result !== "string" || !/^0x[\da-f]*$/i.test(body.result)) throw new Error(`eth_call on chain ${String(chainId)}: the node returned no data field.`);
      return { result: body.result as Hex };
    },
  };
}

/** The number of the latest finalized block of the chain. */
export async function finalizedBlock(rpc: RawRpc): Promise<bigint> {
  const block = await rpc.request("eth_getBlockByNumber", ["finalized", false]);
  if (typeof block !== "object" || block === null || !("number" in block) || typeof block.number !== "string") throw new Error("The node returned no finalized block.");
  return BigInt(block.number);
}
