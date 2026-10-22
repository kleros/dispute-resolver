import { afterEach, describe, expect, it, vi } from "vitest";
import { createReceiptWaiter } from "./receipts";

const HASH = "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";
const SENDER = "0x1111111111111111111111111111111111111111";
const READ_RPC = "https://read.rpc.test/mainnet";
const ARBITRATOR = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const DISPUTE_CREATION = "0x141dfc18aa6a56fc816f44f0e9e2f1ebc92b15ab167770e17db5b084c10ed995";

const RECEIPT = {
  transactionHash: HASH,
  transactionIndex: "0x0",
  blockHash: "0x" + "ab".repeat(32),
  blockNumber: "0x10",
  from: SENDER,
  to: ARBITRATOR,
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  effectiveGasPrice: "0x1",
  contractAddress: null,
  logs: [
    {
      address: ARBITRATOR,
      topics: [DISPUTE_CREATION, "0x" + "0".repeat(63) + "5"],
      data: "0x",
      blockNumber: "0x10",
      blockHash: "0x" + "ab".repeat(32),
      transactionHash: HASH,
      transactionIndex: "0x0",
      logIndex: "0x0",
      removed: false,
    },
  ],
  logsBloom: "0x" + "0".repeat(512),
  status: "0x1",
  type: "0x2",
};

interface JsonRpcCall {
  readonly url: string;
  readonly method: string;
}

type RpcAnswer = (method: string, params: readonly unknown[]) => unknown;

/** A global fetch answering JSON-RPC through `answer` (`null` when it has none), recording which URL each method went to. */
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

/** An RPC transaction object as `eth_getTransactionByHash` and `eth_getBlockByNumber` return it. */
function rpcTransaction(fields: { hash: string; to: string; value: string; input: string; blockNumber: string | null }) {
  return {
    ...fields,
    from: SENDER,
    nonce: "0x7",
    gas: "0x5208",
    maxFeePerGas: "0x2",
    maxPriorityFeePerGas: "0x1",
    type: "0x2",
    chainId: "0x1",
    accessList: [],
    blockHash: fields.blockNumber === null ? null : "0x" + "ab".repeat(32),
    transactionIndex: fields.blockNumber === null ? null : "0x0",
    v: "0x0",
    yParity: "0x0",
    r: "0x" + "1".repeat(64),
    s: "0x" + "2".repeat(64),
  };
}

/**
 * The chain after a wallet replaced the awaited transaction: the awaited hash is known but never mined, and block 0x10
 * holds a transaction of the same sender and nonce with the given recipient, value and data, mined successfully.
 */
function replacedOnChain(replacement: { to: string; value: string; input: string }): RpcAnswer {
  const awaited = rpcTransaction({ hash: HASH, to: ARBITRATOR, value: "0x64", input: CALLDATA, blockNumber: null });
  const mined = rpcTransaction({ hash: REPLACEMENT_HASH, ...replacement, blockNumber: "0x10" });
  const block = {
    number: "0x10",
    hash: "0x" + "ab".repeat(32),
    parentHash: "0x" + "cd".repeat(32),
    timestamp: "0x6553f100",
    nonce: "0x0000000000000000",
    difficulty: "0x0",
    totalDifficulty: null,
    gasLimit: "0x1c9c380",
    gasUsed: "0x5208",
    baseFeePerGas: "0x1",
    miner: "0x" + "0".repeat(40),
    extraData: "0x",
    logsBloom: "0x" + "0".repeat(512),
    mixHash: "0x" + "0".repeat(64),
    receiptsRoot: "0x" + "0".repeat(64),
    stateRoot: "0x" + "0".repeat(64),
    transactionsRoot: "0x" + "0".repeat(64),
    sha3Uncles: "0x" + "0".repeat(64),
    size: "0x100",
    uncles: [],
    transactions: [mined],
  };
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

    expect(receipt).toEqual({
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

  describe("a transaction replaced in the wallet is reported with viem's reason and the awaited hash", () => {
    it("repriced: the same call at another gas price (a wallet's Speed up)", async () => {
      stubRpc(replacedOnChain({ to: ARBITRATOR, value: "0x64", input: CALLDATA }));
      const receipt = await createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC })(1, HASH);
      expect(receipt.transactionHash).toBe(REPLACEMENT_HASH);
      expect(receipt.status).toBe("success");
      expect(receipt.replacement).toEqual({ reason: "repriced", replacedHash: HASH });
    });

    it("cancelled: a zero-value transaction to the sender itself (a wallet's Cancel)", async () => {
      stubRpc(replacedOnChain({ to: SENDER, value: "0x0", input: "0x" }));
      const receipt = await createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC })(1, HASH);
      expect(receipt.transactionHash).toBe(REPLACEMENT_HASH);
      expect(receipt.replacement).toEqual({ reason: "cancelled", replacedHash: HASH });
    });

    it("replaced: a different call with the same nonce", async () => {
      stubRpc(replacedOnChain({ to: ARBITRATOR, value: "0x0", input: CALLDATA }));
      const receipt = await createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC })(1, HASH);
      expect(receipt.transactionHash).toBe(REPLACEMENT_HASH);
      expect(receipt.replacement).toEqual({ reason: "replaced", replacedHash: HASH });
    });
  });

  it("a receipt of the awaited hash carries no replacement", async () => {
    stubRpc({ eth_blockNumber: "0x10", eth_getTransactionReceipt: RECEIPT, eth_chainId: "0x1" });
    const receipt = await createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC })(1, HASH);
    expect(receipt).not.toHaveProperty("replacement");
  });

  it("a chain without a read RPC rejects the receipt instead of falling back", async () => {
    const calls = stubRpc({});
    await expect(createReceiptWaiter({})(1, HASH)).rejects.toThrow("Reads on chain 1 are unavailable.");
    await expect(createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC })(10, HASH)).rejects.toThrow("Reads on chain 10 are unavailable.");
    expect(calls).toEqual([]);
  });
});
