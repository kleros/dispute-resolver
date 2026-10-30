import { getChain, redactingHttp, resolveReadRpcUrl, type Env, type Hex } from "@dispute-resolver/core";
import { createPublicClient, type PublicClient } from "viem";
import { noRpcError } from "./sectionData";
import type { WriteReceipt } from "./types";

type ReceiptClient = Pick<PublicClient, "waitForTransactionReceipt">;

/**
 * Receipts are polled through the configured read RPC of the chain, never through wagmi, whose transports AppKit wraps
 * in a fallback to Reown's RPC. A chain without a configured RPC rejects, and the write flow reports it.
 */
export function createReceiptWaiter(env: Env): (chainId: number, hash: Hex) => Promise<WriteReceipt> {
  const clients = new Map<number, ReceiptClient>();

  const clientFor = (chainId: number): ReceiptClient => {
    const existing = clients.get(chainId);
    if (existing !== undefined) return existing;
    const chain = getChain(chainId);
    const resolution = chain === undefined ? undefined : resolveReadRpcUrl(chain, env);
    if (resolution?.status !== "configured") throw new Error(noRpcError(chainId).message);
    const client = createPublicClient({ transport: redactingHttp(resolution.url) });
    clients.set(chainId, client);
    return client;
  };

  return async (chainId, hash) => {
    let replacement: WriteReceipt["replacement"];
    const receipt = await clientFor(chainId).waitForTransactionReceipt({
      hash,
      // A wallet's "Speed up" or "Cancel" mines another hash; viem then resolves with that receipt and reports why, so
      // the write flow can tell a repricing (the same call) from a cancellation or a different call.
      onReplaced: ({ reason }) => {
        replacement = { reason };
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
