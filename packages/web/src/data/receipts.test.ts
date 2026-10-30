import { afterEach, describe, expect, it, vi } from "vitest";
import { createReceiptWaiter } from "./receipts";

const HASH = "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";
const SENDER = "0x1111111111111111111111111111111111111111";
const READ_RPC = "https://read.rpc.test/mainnet";
const ARBITRATOR = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const DISPUTE_CREATION = "0x141dfc18aa6a56fc816f44f0e9e2f1ebc92b15ab167770e17db5b084c10ed995";

const RECEIPT = {
  transactionHash: HASH,
  blockNumber: "0x10",
  logs: [{ address: ARBITRATOR, topics: [DISPUTE_CREATION, "0x" + "0".repeat(63) + "5"], data: "0x" }],
  status: "0x1",
};

interface JsonRpcCall {
  readonly url: string;
  readonly method: string;
}

type RpcAnswer = (method: string, params: readonly unknown[]) => unknown;

function stubRpc(answers: Readonly<Record<string, unknown>> | RpcAnswer): JsonRpcCall[] {
  const answer: RpcAnswer = typeof answers === "function" ? answers : (method) => answers[method];
  const calls: JsonRpcCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { id: number; method: string; params?: unknown[] };
      calls.push({ url, method: body.method });
      const result = answer(body.method, body.params ?? []) ?? null;
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } }));
    }),
  );
  return calls;
}

const REPLACEMENT_HASH = "0x9d0a3c1b5e2f4a6d8c7b0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d";
const CALLDATA = "0xd98493f60000000000000000000000000000000000000000000000000000000000000005";

function rpcTransaction(fields: { hash: string; to: string; value: string; input: string; blockNumber: string | null }) {
  return { ...fields, from: SENDER, nonce: "0x7" };
}

/**
 * The chain after a wallet replaced the awaited transaction: the awaited hash is known but never mined, and block 0x10
 * holds a transaction of the same sender and nonce with the given recipient, value and data, mined successfully.
 */
function replacedOnChain(replacement: { to: string; value: string; input: string }): RpcAnswer {
  const awaited = rpcTransaction({ hash: HASH, to: ARBITRATOR, value: "0x64", input: CALLDATA, blockNumber: null });
  const mined = rpcTransaction({ hash: REPLACEMENT_HASH, ...replacement, blockNumber: "0x10" });
  const block = { number: "0x10", hash: "0x" + "ab".repeat(32), transactions: [mined] };
  const minedReceipt = { ...RECEIPT, transactionHash: REPLACEMENT_HASH, logs: [] };
  // Keyed by method, then by the first parameter where the answer depends on it.
  const answers = new Map<string, unknown>([
    ["eth_blockNumber", "0x10"],
    ["eth_chainId", "0x1"],
    ["eth_getBlockByNumber", block],
    [`eth_getTransactionByHash:${HASH}`, awaited],
    [`eth_getTransactionByHash:${REPLACEMENT_HASH}`, mined],
    [`eth_getTransactionReceipt:${REPLACEMENT_HASH}`, minedReceipt],
  ]);
  return (method, params) => answers.get(method) ?? answers.get(`${method}:${String(params[0])}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createReceiptWaiter", () => {
  it("reads the receipt through the chain's configured read RPC and maps it to a WriteReceipt", async () => {
    const calls = stubRpc({ eth_blockNumber: "0x10", eth_getTransactionReceipt: RECEIPT, eth_chainId: "0x1" });
    const waitForReceipt = createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC });

    const receipt = await waitForReceipt(1, HASH);

    expect(receipt).toStrictEqual({
      transactionHash: HASH,
      status: "success",
      blockNumber: 16n,
      logs: [{ address: ARBITRATOR, topics: [DISPUTE_CREATION, "0x" + "0".repeat(63) + "5"] }],
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.url === READ_RPC)).toBe(true);
  });

  it("reports a reverted transaction as reverted", async () => {
    stubRpc({ eth_blockNumber: "0x10", eth_getTransactionReceipt: { ...RECEIPT, status: "0x0" }, eth_chainId: "0x1" });
    const receipt = await createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC })(1, HASH);
    expect(receipt.status).toBe("reverted");
  });

  it.each([
    ["repriced", "the same call at another gas price (a wallet's Speed up)", { to: ARBITRATOR, value: "0x64", input: CALLDATA }],
    ["cancelled", "a zero-value transaction to the sender itself (a wallet's Cancel)", { to: SENDER, value: "0x0", input: "0x" }],
    ["replaced", "a different call with the same nonce", { to: ARBITRATOR, value: "0x0", input: CALLDATA }],
  ] as const)("a transaction replaced in the wallet is reported with viem's reason and the awaited hash: %s, %s", async (reason, _description, replacement) => {
    stubRpc(replacedOnChain(replacement));
    const receipt = await createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC })(1, HASH);
    expect(receipt.transactionHash).toBe(REPLACEMENT_HASH);
    expect(receipt.status).toBe("success");
    expect(receipt.replacement).toEqual({ reason });
  });

  it("a chain without a read RPC rejects the receipt instead of falling back", async () => {
    const calls = stubRpc({});
    await expect(createReceiptWaiter({})(1, HASH)).rejects.toThrow("Reads on chain 1 are unavailable.");
    await expect(createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC })(10, HASH)).rejects.toThrow("Reads on chain 10 are unavailable.");
    expect(calls).toEqual([]);
  });
});
