import { getChain, resolveReadRpcUrl, type ChainId, type Env, type Hex } from "@dispute-resolver/core";
import { createPublicClient, http, type PublicClient } from "viem";
import type { WriteReceipt } from "./types";

type ReceiptClient = Pick<PublicClient, "waitForTransactionReceipt">;

/**
 * `CoreDeps.waitForReceipt` (ARCHITECTURE.md §6.4): receipts are polled through the configured read RPC of the chain,
 * never through wagmi, whose transports AppKit wraps in a fallback to Reown's RPC (A13). One client per chain, used
 * for `waitForTransactionReceipt` only. A chain without a configured RPC rejects (D-56), and the write flow reports it.
 */
export function createReceiptWaiter(env: Env): (chainId: ChainId, hash: Hex) => Promise<WriteReceipt> {
  const clients = new Map<ChainId, ReceiptClient>();

  const clientFor = (chainId: ChainId): ReceiptClient => {
    const existing = clients.get(chainId);
    if (existing !== undefined) return existing;
    const chain = getChain(chainId);
    const resolution = chain === undefined ? undefined : resolveReadRpcUrl(chain, env);
    if (resolution?.status !== "configured") throw new Error(`No RPC is configured for chain ${String(chainId)}.`);
    const client = createPublicClient({ transport: http(resolution.url) });
    clients.set(chainId, client);
    return client;
  };

  return async (chainId, hash) => {
    let replacement: WriteReceipt["replacement"];
    const receipt = await clientFor(chainId).waitForTransactionReceipt({
      hash,
      // A wallet's "Speed up" or "Cancel" mines another hash; viem then resolves with that receipt and reports why, so
      // the write flow can tell a repricing (the same call, D-07, D-51) from a cancellation or a different call.
      onReplaced: ({ reason }) => {
        replacement = { reason, replacedHash: hash };
      },
    });
    return {
      transactionHash: receipt.transactionHash,
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      logs: receipt.logs.map((log) => ({ address: log.address, topics: [...log.topics] })),
      ...(replacement === undefined ? {} : { replacement }),
    };
  };
}
