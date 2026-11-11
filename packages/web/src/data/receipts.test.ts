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
  readonly params: readonly unknown[];
  /** The fake clock when the request was sent. */
  readonly at: number;
}

type RpcAnswer = (method: string, params: readonly unknown[]) => unknown;

/** An answer that throws stands for a failed request, and one that returns a promise for a slow one. */
function stubRpc(answers: Readonly<Record<string, unknown>> | RpcAnswer): JsonRpcCall[] {
  const answer: RpcAnswer = typeof answers === "function" ? answers : (method) => answers[method];
  const calls: JsonRpcCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { id: number; method: string; params?: unknown[] };
      const params = body.params ?? [];
      calls.push({ url, method: body.method, params, at: Date.now() });
      const result = (await answer(body.method, params)) ?? null;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

const REPLACEMENT_HASH = "0x9d0a3c1b5e2f4a6d8c7b0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d";
const OTHER_HASH = "0x3e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f";
const CALLDATA = "0xd98493f60000000000000000000000000000000000000000000000000000000000000005";

interface TransactionFields {
  readonly hash: string;
  readonly to: string;
  readonly value: string;
  readonly input: string;
  readonly blockNumber: string | null;
  readonly from?: string;
  readonly nonce?: string;
}

function rpcTransaction({ from = SENDER, nonce = "0x7", ...fields }: TransactionFields) {
  return { ...fields, from, nonce };
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

/** A chain that mines an empty block at every block-number read, whatever the clock says. */
function advancingChain(receipt: (method: string) => unknown): RpcAnswer {
  let block = 0x10;
  return (method, params) => {
    if (method === "eth_blockNumber") {
      block += 1;
      return `0x${block.toString(16)}`;
    }
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_getBlockByNumber") return { number: params[0], hash: "0x" + "cd".repeat(32), transactions: [] };
    if (method === "eth_getTransactionByHash") return rpcTransaction({ hash: HASH, to: ARBITRATOR, value: "0x64", input: CALLDATA, blockNumber: null });
    return method === "eth_getTransactionReceipt" ? receipt(method) : undefined;
  };
}

/** The head when the wait begins; the chain below mines a block every 12 s of the fake clock from there. */
const FIRST_HEAD = 0x1000;
const BLOCK_TIME_MS = 12_000;

function hex(number: number): string {
  return `0x${number.toString(16)}`;
}

const AWAITED = rpcTransaction({ hash: HASH, to: ARBITRATOR, value: "0x64", input: CALLDATA, blockNumber: null });

function speedUpIn(block: number) {
  return rpcTransaction({ hash: REPLACEMENT_HASH, to: ARBITRATOR, value: "0x64", input: CALLDATA, blockNumber: hex(block) });
}

function minedReceipt(hash: string, block: number) {
  return { ...RECEIPT, transactionHash: hash, blockNumber: hex(block), logs: [] };
}

interface ClockChain {
  /** Blocks added to the head from this many ms after the chain was made, as after a laptop sleeps. */
  readonly gap?: { readonly after: number; readonly blocks: number };
  /** The transactions of a block; `null` while the RPC cannot serve it. Throwing stands for a failed read. */
  readonly block?: (number: number) => readonly unknown[] | null;
  /** A receipt by hash, `null` while there is none. */
  readonly receipt?: (hash: string) => unknown;
  /** A transaction by hash; by default the awaited one, pending, and no other. */
  readonly transaction?: (hash: string) => unknown;
}

/**
 * A chain whose head follows the fake clock, so request rates can be measured against time. Make it after
 * `vi.useFakeTimers()`. By default every block is empty and no receipt exists.
 */
function clockChain({ gap, block = () => [], receipt = () => null, transaction = (hash) => (hash === HASH ? AWAITED : null) }: ClockChain = {}): RpcAnswer {
  const began = Date.now();
  const head = () => {
    const elapsed = Date.now() - began;
    return FIRST_HEAD + Math.floor(elapsed / BLOCK_TIME_MS) + (gap !== undefined && elapsed >= gap.after ? gap.blocks : 0);
  };
  return (method, params) => {
    const first = String(params[0]);
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_blockNumber") return hex(head());
    if (method === "eth_getTransactionByHash") return transaction(first);
    if (method === "eth_getTransactionReceipt") return receipt(first);
    if (method !== "eth_getBlockByNumber") return undefined;
    const transactions = block(Number(first));
    return transactions === null ? null : { number: first, hash: "0x" + "cd".repeat(32), transactions };
  };
}

function blocksAsked(calls: readonly JsonRpcCall[]): number[] {
  return calls.filter((call) => call.method === "eth_getBlockByNumber").map((call) => Number(call.params[0]));
}

function receiptAsks(calls: readonly JsonRpcCall[], hash: string): number[] {
  return calls.filter((call) => call.method === "eth_getTransactionReceipt" && call.params[0] === hash).map((call) => call.at);
}

function gaps(times: readonly number[]): number[] {
  return times.slice(1).map((time, index) => time - (times[index] ?? time));
}

function waitFor(cannotConfirmYet?: () => void) {
  return createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC })(1, HASH, cannotConfirmYet);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface Settlement<T> {
  readonly state: "pending" | "resolved" | "rejected";
  readonly value: T | undefined;
}

function settlement<T>(promise: Promise<T>): Settlement<T> {
  const tracked: { state: Settlement<T>["state"]; value: T | undefined } = { state: "pending", value: undefined };
  promise.then(
    (value) => {
      tracked.state = "resolved";
      tracked.value = value;
    },
    () => {
      tracked.state = "rejected";
    },
  );
  return tracked;
}

describe("createReceiptWaiter", () => {
  it("reads the receipt through the chain's configured read RPC and maps it to a WriteReceipt", async () => {
    const calls = stubRpc({ eth_blockNumber: "0x10", eth_getTransactionReceipt: RECEIPT, eth_chainId: "0x1" });

    const receipt = await waitFor();

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
    const receipt = await waitFor();
    expect(receipt.status).toBe("reverted");
  });

  it.each([
    ["repriced", "the same call at another gas price (a wallet's Speed up)", { to: ARBITRATOR, value: "0x64", input: CALLDATA }],
    ["cancelled", "a zero-value transaction to the sender itself (a wallet's Cancel)", { to: SENDER, value: "0x0", input: "0x" }],
    ["replaced", "a different call with the same nonce", { to: ARBITRATOR, value: "0x0", input: CALLDATA }],
  ] as const)("a transaction replaced in the wallet is reported with viem's reason and the hash that was mined: %s, %s", async (reason, _description, replacement) => {
    stubRpc(replacedOnChain(replacement));
    const receipt = await waitFor();
    expect(receipt.transactionHash).toBe(REPLACEMENT_HASH);
    expect(receipt.status).toBe("success");
    expect(receipt.replacement).toEqual({ reason });
  });

  it("waits for a transaction not yet mined past any deadline, and resolves once it is mined", async () => {
    vi.useFakeTimers();
    let mined = false;
    stubRpc(advancingChain((method) => (method === "eth_getTransactionReceipt" && !mined ? null : RECEIPT)));
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(settled.state).toBe("pending");
    mined = true;
    await vi.advanceTimersByTimeAsync(35_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(HASH);
  });

  it("a read RPC that keeps failing never ends the wait: it says once that it cannot confirm yet, and resolves once the RPC answers", async () => {
    vi.useFakeTimers();
    let reachable = false;
    const chain = advancingChain(() => RECEIPT);
    stubRpc((method, params) => {
      if (!reachable) throw new TypeError("fetch failed");
      return chain(method, params);
    });
    const cannotConfirmYet = vi.fn();
    const settled = settlement(waitFor(cannotConfirmYet));
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(settled.state).toBe("pending");
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
    reachable = true;
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.status).toBe("success");
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
  });

  it("an RPC that is down says it cannot confirm yet at the third failed look in a row, and only once", async () => {
    vi.useFakeTimers();
    const calls = stubRpc(() => {
      throw new TypeError("fetch failed");
    });
    const cannotConfirmYet = vi.fn();
    void waitFor(cannotConfirmYet);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(calls).toHaveLength(2);
    expect(cannotConfirmYet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toHaveLength(3);
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
  });

  it("a third failed look in a row is reported even when it failed after reading the head", async () => {
    vi.useFakeTimers();
    const chain = clockChain();
    let receiptReads = 0;
    let transactionAsks = 0;
    stubRpc((method, params) => {
      if (method === "eth_getTransactionReceipt") receiptReads += 1;
      if (method === "eth_getTransactionByHash") transactionAsks += 1;
      if ((method === "eth_getTransactionReceipt" && receiptReads <= 2) || (method === "eth_getTransactionByHash" && transactionAsks === 1)) {
        throw new TypeError("fetch failed");
      }
      return chain(method, params);
    });
    const cannotConfirmYet = vi.fn();
    void waitFor(cannotConfirmYet);
    await vi.advanceTimersByTimeAsync(3_500);
    expect(transactionAsks).toBe(1);
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
  });

  it("during a long outage the looks slow down to one every 30 s, and no further", async () => {
    vi.useFakeTimers();
    const calls = stubRpc(() => {
      throw new TypeError("fetch failed");
    });
    void waitFor();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    const spacing = gaps(calls.map((call) => call.at));
    expect(spacing.slice(0, 5)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
    expect(spacing.slice(5).every((gap) => gap === 30_000)).toBe(true);
    expect(spacing.length).toBeGreaterThan(50);
  });

  it("one failed request among many looks says nothing, and the receipt is still found", async () => {
    vi.useFakeTimers();
    let mined = false;
    let requests = 0;
    const chain = clockChain({ receipt: (hash) => (hash === HASH && mined ? minedReceipt(HASH, FIRST_HEAD + 25) : null) });
    stubRpc((method, params) => {
      requests += 1;
      if (requests === 20) throw new TypeError("fetch failed");
      return chain(method, params);
    });
    const cannotConfirmYet = vi.fn();
    const settled = settlement(waitFor(cannotConfirmYet));
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(requests).toBeGreaterThan(20);
    mined = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(HASH);
    expect(cannotConfirmYet).not.toHaveBeenCalled();
  });

  it("a read RPC that fails for a while once the wait has begun is asked again until it answers, and the receipt is then found", async () => {
    vi.useFakeTimers();
    let requests = 0;
    const chain = advancingChain((method) => (method === "eth_getTransactionReceipt" && requests <= 8 ? null : RECEIPT));
    stubRpc((method, params) => {
      requests += 1;
      if (requests > 2 && requests <= 8) throw new TypeError("fetch failed");
      return chain(method, params);
    });
    const cannotConfirmYet = vi.fn();
    const settled = settlement(waitFor(cannotConfirmYet));
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(HASH);
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
  });

  it("having said it cannot confirm yet during a short outage, the wait goes back to a look every 4 s", async () => {
    vi.useFakeTimers();
    const began = Date.now();
    const chain = clockChain();
    const calls = stubRpc((method, params) => {
      if (Date.now() - began < 10_000) throw new TypeError("fetch failed");
      return chain(method, params);
    });
    const cannotConfirmYet = vi.fn();
    void waitFor(cannotConfirmYet);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
    const looks = receiptAsks(calls, HASH).filter((at) => at - began >= 60_000 && at - began < 120_000);
    expect(looks).toHaveLength(15);
  });

  it("a block the RPC cannot serve yet is asked for again, and a speed-up in it is found without saying it cannot confirm", async () => {
    vi.useFakeTimers();
    const speedUpBlock = FIRST_HEAD + 1;
    let asks = 0;
    const calls = stubRpc(
      clockChain({
        block: (number) => {
          if (number !== speedUpBlock) return [];
          asks += 1;
          return asks <= 3 ? null : [speedUpIn(speedUpBlock)];
        },
        receipt: (hash) => (hash === REPLACEMENT_HASH ? minedReceipt(REPLACEMENT_HASH, speedUpBlock) : null),
      }),
    );
    const cannotConfirmYet = vi.fn();
    const settled = settlement(waitFor(cannotConfirmYet));
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(REPLACEMENT_HASH);
    expect(settled.value?.replacement).toEqual({ reason: "repriced" });
    expect(blocksAsked(calls).filter((number) => number === speedUpBlock)).toHaveLength(4);
    expect(cannotConfirmYet).not.toHaveBeenCalled();
  });

  it("a block whose read failed is read again, and a speed-up in it is found", async () => {
    vi.useFakeTimers();
    const speedUpBlock = FIRST_HEAD + 1;
    let failed = 0;
    stubRpc(
      clockChain({
        block: (number) => {
          if (number !== speedUpBlock) return [];
          if (failed < 2) {
            failed += 1;
            throw new TypeError("fetch failed");
          }
          return [speedUpIn(speedUpBlock)];
        },
        receipt: (hash) => (hash === REPLACEMENT_HASH ? minedReceipt(REPLACEMENT_HASH, speedUpBlock) : null),
      }),
    );
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(REPLACEMENT_HASH);
    expect(settled.value?.replacement).toEqual({ reason: "repriced" });
  });

  it("a speed-up whose receipt the RPC cannot serve yet is still found, after the awaited transaction is gone", async () => {
    vi.useFakeTimers();
    const replaced = replacedOnChain({ to: ARBITRATOR, value: "0x64", input: CALLDATA });
    let blockServed = false;
    let replacementReceiptAsks = 0;
    stubRpc((method, params) => {
      if (method === "eth_getBlockByNumber") blockServed = true;
      if (method === "eth_getTransactionByHash" && params[0] === HASH && blockServed) return null;
      if (method === "eth_getTransactionReceipt" && params[0] === REPLACEMENT_HASH) {
        replacementReceiptAsks += 1;
        if (replacementReceiptAsks <= 2) return null;
      }
      return replaced(method, params);
    });
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(REPLACEMENT_HASH);
    expect(settled.value?.replacement).toEqual({ reason: "repriced" });
  });

  it("the receipt of a speed-up is read in the same moment its block is searched", async () => {
    vi.useFakeTimers();
    const speedUpBlock = FIRST_HEAD + 3;
    const calls = stubRpc(
      clockChain({
        block: (number) => (number === speedUpBlock ? [speedUpIn(speedUpBlock)] : []),
        receipt: (hash) => (hash === REPLACEMENT_HASH ? minedReceipt(REPLACEMENT_HASH, speedUpBlock) : null),
      }),
    );
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(settled.value?.transactionHash).toBe(REPLACEMENT_HASH);
    const searched = calls.find((call) => call.method === "eth_getBlockByNumber" && Number(call.params[0]) === speedUpBlock);
    expect(receiptAsks(calls, REPLACEMENT_HASH)).toEqual([searched?.at]);
  });

  it("another transaction of the sender with a different nonce is not taken for a replacement", async () => {
    vi.useFakeTimers();
    const otherBlock = FIRST_HEAD + 1;
    const other = rpcTransaction({ hash: OTHER_HASH, to: ARBITRATOR, value: "0x0", input: CALLDATA, blockNumber: hex(otherBlock), nonce: "0x6" });
    let mined = false;
    stubRpc(
      clockChain({
        block: (number) => (number === otherBlock ? [other] : []),
        receipt: (hash) => {
          if (hash === OTHER_HASH) return minedReceipt(OTHER_HASH, otherBlock);
          return hash === HASH && mined ? minedReceipt(HASH, FIRST_HEAD + 10) : null;
        },
      }),
    );
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(settled.state).toBe("pending");
    mined = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(HASH);
    expect(settled.value?.replacement).toBeUndefined();
  });

  it("a transaction of another sender with the same nonce is not taken for a replacement", async () => {
    vi.useFakeTimers();
    const otherBlock = FIRST_HEAD + 1;
    const other = rpcTransaction({
      hash: OTHER_HASH,
      to: ARBITRATOR,
      value: "0x0",
      input: CALLDATA,
      blockNumber: hex(otherBlock),
      from: "0x2222222222222222222222222222222222222222",
    });
    let mined = false;
    stubRpc(
      clockChain({
        block: (number) => (number === otherBlock ? [other] : []),
        receipt: (hash) => {
          if (hash === OTHER_HASH) return minedReceipt(OTHER_HASH, otherBlock);
          return hash === HASH && mined ? minedReceipt(HASH, FIRST_HEAD + 10) : null;
        },
      }),
    );
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(settled.state).toBe("pending");
    mined = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled.value?.transactionHash).toBe(HASH);
    expect(settled.value?.replacement).toBeUndefined();
  });

  it("a call to the same contract with the same value but other calldata is reported as replaced, not repriced", async () => {
    stubRpc(replacedOnChain({ to: ARBITRATOR, value: "0x64", input: "0xd98493f60000000000000000000000000000000000000000000000000000000000000006" }));
    const receipt = await waitFor();
    expect(receipt.replacement).toEqual({ reason: "replaced" });
  });

  it("three failed looks that are not in a row say nothing", async () => {
    vi.useFakeTimers();
    const chain = clockChain();
    let receiptAsksSoFar = 0;
    stubRpc((method, params) => {
      if (method === "eth_getTransactionReceipt") {
        receiptAsksSoFar += 1;
        if (receiptAsksSoFar % 2 === 1 && receiptAsksSoFar <= 5) throw new TypeError("fetch failed");
      }
      return chain(method, params);
    });
    const cannotConfirmYet = vi.fn();
    void waitFor(cannotConfirmYet);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(receiptAsksSoFar).toBeGreaterThan(5);
    expect(cannotConfirmYet).not.toHaveBeenCalled();
  });

  it("a block the RPC cannot serve in the middle of a catch-up is asked for again, and a speed-up in it is found", async () => {
    vi.useFakeTimers();
    const target = FIRST_HEAD + 3;
    let asks = 0;
    stubRpc(
      clockChain({
        gap: { after: 1, blocks: 6 },
        block: (number) => {
          if (number !== target) return [];
          asks += 1;
          return asks === 1 ? null : [speedUpIn(target)];
        },
        receipt: (hash) => (hash === REPLACEMENT_HASH ? minedReceipt(REPLACEMENT_HASH, target) : null),
      }),
    );
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(settled.value?.transactionHash).toBe(REPLACEMENT_HASH);
  });

  it("the awaited transaction seen in a block before its receipt is served is not taken for a replacement", async () => {
    vi.useFakeTimers();
    const minedBlock = FIRST_HEAD + 1;
    let receiptServed = false;
    stubRpc(
      clockChain({
        block: (number) => (number === minedBlock ? [{ ...AWAITED, blockNumber: hex(minedBlock) }] : []),
        receipt: (hash) => (hash === HASH && receiptServed ? minedReceipt(HASH, minedBlock) : null),
      }),
    );
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled.state).toBe("pending");
    receiptServed = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(HASH);
    expect(settled.value?.replacement).toBeUndefined();
  });

  it("a speed-up is found when the RPC writes the sender's address in another case in the block than in the transaction", async () => {
    vi.useFakeTimers();
    const checksummed = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    const speedUpBlock = FIRST_HEAD + 1;
    stubRpc(
      clockChain({
        transaction: (hash) => (hash === HASH ? { ...AWAITED, from: checksummed.toLowerCase() } : null),
        block: (number) => (number === speedUpBlock ? [{ ...speedUpIn(speedUpBlock), from: checksummed }] : []),
        receipt: (hash) => (hash === REPLACEMENT_HASH ? minedReceipt(REPLACEMENT_HASH, speedUpBlock) : null),
      }),
    );
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled.value?.transactionHash).toBe(REPLACEMENT_HASH);
    expect(settled.value?.replacement).toEqual({ reason: "repriced" });
  });

  it("a speed-up mined before the read RPC knew the awaited transaction is still found", async () => {
    vi.useFakeTimers();
    const awaited = rpcTransaction({ hash: HASH, to: ARBITRATOR, value: "0x64", input: CALLDATA, blockNumber: null });
    const speedUp = rpcTransaction({ hash: REPLACEMENT_HASH, to: ARBITRATOR, value: "0x64", input: CALLDATA, blockNumber: "0x12" });
    let head = 0x10;
    let awaitedAsks = 0;
    stubRpc((method, params): unknown => {
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_blockNumber") {
        head += 1;
        return `0x${head.toString(16)}`;
      }
      if (method === "eth_getTransactionByHash") {
        awaitedAsks += 1;
        return params[0] === HASH && awaitedAsks > 4 ? awaited : null;
      }
      if (method === "eth_getTransactionReceipt")
        return params[0] === REPLACEMENT_HASH && head >= 0x12 ? { ...RECEIPT, transactionHash: REPLACEMENT_HASH, blockNumber: "0x12", logs: [] } : null;
      if (method !== "eth_getBlockByNumber") return undefined;
      return { number: params[0], hash: "0x" + "cd".repeat(32), transactions: Number(params[0]) === 0x12 ? [speedUp] : [] };
    });
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(REPLACEMENT_HASH);
    expect(settled.value?.replacement).toEqual({ reason: "repriced" });
  });

  it("when a reorg mines the awaited transaction instead of a speed-up already found, the wait resolves with the awaited receipt", async () => {
    vi.useFakeTimers();
    const speedUpBlock = FIRST_HEAD + 1;
    let reorged = false;
    stubRpc(
      clockChain({
        block: (number) => (number === speedUpBlock ? [speedUpIn(speedUpBlock)] : []),
        receipt: (hash) => (hash === HASH && reorged ? minedReceipt(HASH, speedUpBlock) : null),
      }),
    );
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled.state).toBe("pending");
    reorged = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(HASH);
    expect(settled.value?.replacement).toBeUndefined();
  });

  it("while the transaction is pending and the search is caught up, a minute costs 35 requests: two per 4 s look and one per new block", async () => {
    vi.useFakeTimers();
    const began = Date.now();
    const calls = stubRpc(clockChain());
    void waitFor();
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    const minute = calls.filter((call) => call.at - began >= 60_000 && call.at - began < 120_000);
    expect(minute.length).toBeGreaterThan(0);
    expect(minute.length).toBeLessThanOrEqual(35);
  });

  it("after a jump of 3000 blocks an instant RPC gets at most 20 requests a second, and a speed-up near the end is found", async () => {
    vi.useFakeTimers();
    const gap = { after: 60_000, blocks: 3000 };
    const speedUpBlock = FIRST_HEAD + 5 + gap.blocks - 5;
    const calls = stubRpc(
      clockChain({
        gap,
        block: (number) => (number === speedUpBlock ? [speedUpIn(speedUpBlock)] : []),
        receipt: (hash) => (hash === REPLACEMENT_HASH ? minedReceipt(REPLACEMENT_HASH, speedUpBlock) : null),
      }),
    );
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(gap.after + 5 * 60_000);
    expect(settled.value?.transactionHash).toBe(REPLACEMENT_HASH);
    const busiestSecond = Math.max(...calls.map(({ at }) => calls.filter((call) => call.at >= at && call.at < at + 1_000).length));
    expect(busiestSecond).toBeLessThanOrEqual(20);
  });

  it("an awaited receipt that appears during a long catch-up is found before more than one step of blocks is read", async () => {
    vi.useFakeTimers();
    let mined = false;
    const chain = clockChain({
      gap: { after: 60_000, blocks: 3000 },
      receipt: (hash) => (hash === HASH && mined ? minedReceipt(HASH, FIRST_HEAD + 100) : null),
    });
    const calls = stubRpc(async (method, params) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return chain(method, params);
    });
    const settled = settlement(waitFor());
    await vi.advanceTimersByTimeAsync(60_000 + 20_000);
    expect(settled.state).toBe("pending");
    mined = true;
    const readBefore = blocksAsked(calls).length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(settled.value?.transactionHash).toBe(HASH);
    expect(blocksAsked(calls).length - readBefore).toBeLessThanOrEqual(16);
  });

  it("a catch-up where every look fails after searching a block slows to a look every 2 s, keeps going and does not say it cannot confirm", async () => {
    vi.useFakeTimers();
    const speedUpBlock = FIRST_HEAD + 60;
    let lastReadServed = false;
    const calls = stubRpc(
      clockChain({
        gap: { after: 1, blocks: 300 },
        block: (number) => {
          lastReadServed = !lastReadServed;
          if (!lastReadServed) throw new TypeError("fetch failed");
          return number === speedUpBlock ? [speedUpIn(speedUpBlock)] : [];
        },
        receipt: (hash) => (hash === REPLACEMENT_HASH ? minedReceipt(REPLACEMENT_HASH, speedUpBlock) : null),
      }),
    );
    const cannotConfirmYet = vi.fn();
    const settled = settlement(waitFor(cannotConfirmYet));
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(settled.value?.transactionHash).toBe(REPLACEMENT_HASH);
    expect(cannotConfirmYet).not.toHaveBeenCalled();
    const spacing = gaps(receiptAsks(calls, HASH)).slice(3);
    expect(spacing.length).toBeGreaterThan(50);
    expect(spacing.every((gap) => gap === 2_000)).toBe(true);
  });

  it("a catch-up where every look fails after searching a block says it cannot confirm yet 10 minutes after the wait began", async () => {
    vi.useFakeTimers();
    let lastReadServed = false;
    stubRpc(
      clockChain({
        gap: { after: 1, blocks: 1000 },
        block: () => {
          lastReadServed = !lastReadServed;
          if (!lastReadServed) throw new TypeError("fetch failed");
          return [];
        },
      }),
    );
    const cannotConfirmYet = vi.fn();
    void waitFor(cannotConfirmYet);
    await vi.advanceTimersByTimeAsync(10 * 60_000 - 5_000);
    expect(cannotConfirmYet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
  });

  it("after a jump of many blocks with the transaction still pending, the blocks are read one at a time, each once and in order", async () => {
    vi.useFakeTimers();
    let head = 0x10;
    let jump = 0;
    let inFlight = 0;
    let mostInFlight = 0;
    const asked: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { id: number; method: string; params?: unknown[] };
        const reply = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { headers: { "content-type": "application/json" } });
        if (body.method === "eth_chainId") return reply("0x1");
        if (body.method === "eth_blockNumber") {
          head += 1 + jump;
          jump = 0;
          return reply(`0x${head.toString(16)}`);
        }
        if (body.method === "eth_getTransactionByHash") return reply(rpcTransaction({ hash: HASH, to: ARBITRATOR, value: "0x64", input: CALLDATA, blockNumber: null }));
        if (body.method !== "eth_getBlockByNumber") return reply(null);
        const number = String(body.params?.[0]);
        asked.push(Number(number));
        inFlight += 1;
        mostInFlight = Math.max(mostInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 200));
        inFlight -= 1;
        return reply({ number, hash: "0x" + "cd".repeat(32), transactions: [] });
      }),
    );
    void waitFor().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(30_000);
    jump = 300;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mostInFlight).toBe(1);
    const first = asked[0] ?? 0;
    expect(asked).toEqual(Array.from({ length: asked.length }, (_, index) => first + index));
    expect(asked.at(-1)).toBeGreaterThanOrEqual(head - 1);
  });

  it("with no receipt 10 minutes after it began, the wait says once that it cannot confirm yet and then looks every 30 s", async () => {
    vi.useFakeTimers();
    const began = Date.now();
    const calls = stubRpc(clockChain());
    const cannotConfirmYet = vi.fn();
    const settled = settlement(waitFor(cannotConfirmYet));
    await vi.advanceTimersByTimeAsync(10 * 60_000 - 1_000);
    expect(cannotConfirmYet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(settled.state).toBe("pending");
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
    const late = receiptAsks(calls, HASH).filter((at) => at - began >= 11 * 60_000);
    expect(late.length).toBeGreaterThan(30);
    expect(gaps(late).every((gap) => gap === 30_000)).toBe(true);
  });

  it.each([
    ["no receipt is found within 10 minutes", 10 * 60_000 + 4_000, 0],
    ["the RPC fails three looks in a row", 20_000, 20_000],
  ] as const)("a cannot-confirm listener that throws when %s does not end the wait, which resolves once the transaction is mined", async (_case, minedAfter, failingFor) => {
    vi.useFakeTimers();
    const began = Date.now();
    const chain = clockChain({ receipt: (hash) => (hash === HASH && Date.now() - began >= minedAfter ? RECEIPT : null) });
    stubRpc((method, params) => {
      if (Date.now() - began < failingFor) throw new TypeError("fetch failed");
      return chain(method, params);
    });
    const cannotConfirmYet = vi.fn(() => {
      throw new Error("listener failed");
    });
    const settled = settlement(waitFor(cannotConfirmYet));
    await vi.advanceTimersByTimeAsync(11 * 60_000);
    expect(settled.state).toBe("resolved");
    expect(settled.value?.transactionHash).toBe(HASH);
    expect(cannotConfirmYet).toHaveBeenCalledOnce();
  });

  it.each([
    ["the awaited transaction is mined", (method: string, params: readonly unknown[]) => (method === "eth_getTransactionReceipt" && params[0] === HASH ? RECEIPT : undefined)],
    ["a speed-up of it is mined", replacedOnChain({ to: ARBITRATOR, value: "0x64", input: CALLDATA })],
  ] as const)("once %s, the wait sends nothing more and never says it cannot confirm", async (_case, answer) => {
    vi.useFakeTimers();
    const chain = advancingChain(() => null);
    const calls = stubRpc((method, params) => answer(method, params) ?? chain(method, params));
    const cannotConfirmYet = vi.fn();
    const settled = settlement(waitFor(cannotConfirmYet));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled.state).toBe("resolved");
    const sent = calls.length;
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(calls).toHaveLength(sent);
    expect(cannotConfirmYet).not.toHaveBeenCalled();
  });

  it("a chain without a read RPC rejects the receipt instead of falling back", async () => {
    const calls = stubRpc({});
    await expect(createReceiptWaiter({})(1, HASH)).rejects.toThrow("Reads on chain 1 are unavailable.");
    await expect(createReceiptWaiter({ REACT_APP_WEB3_PROVIDER_URL: READ_RPC })(10, HASH)).rejects.toThrow("Reads on chain 10 are unavailable.");
    expect(calls).toEqual([]);
  });
});
