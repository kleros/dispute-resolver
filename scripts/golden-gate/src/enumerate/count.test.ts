import { createPublicClient, custom, decodeFunctionData, encodeFunctionResult, HttpRequestError, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { klerosLiquidAbi } from "../../../../packages/core/src/abi";
import { getChain } from "../../../../packages/core/src/chains";
import type { ChainReader } from "../chains";
import { countDisputes, disputeExists } from "./count";

const NO_BACKOFF = { firstBackoffMs: 0 };
const ARBITRATED = "0x0000000000000000000000000000000000000abc";
const RPC_URL_WITH_KEY = "https://rpc.example/v3/secret-key";

function upTo(count: bigint): (disputeId: bigint) => Promise<boolean> {
  return (disputeId) => Promise.resolve(disputeId < count);
}

/** A rate-limit refusal as viem's HTTP transport throws it, with the URL (and its key) in the error. */
function rateLimited(): HttpRequestError {
  return new HttpRequestError({ url: RPC_URL_WITH_KEY, status: 429, body: { method: "eth_call" }, details: "Too Many Requests" });
}

/**
 * A mainnet reader whose arbitrator holds `count` disputes: `disputes(id)` answers a struct below it and reverts from
 * it, as KlerosLiquid on mainnet does. `failure(id, attempt)` makes the attempt-th read of `id` (from 0) throw instead.
 * Counts the reads of each dispute in `reads`.
 */
function mainnetReader(count: bigint, failure: (disputeId: bigint, attempt: number) => Error | null): { reader: ChainReader; reads: Map<bigint, number> } {
  const chain = getChain(1);
  const arbitrator = chain?.klerosLiquid;
  if (chain === undefined || arbitrator === undefined) throw new Error("expected mainnet in core's chain table");
  const reads = new Map<bigint, number>();
  const request = ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    if (method !== "eth_call") return Promise.reject(Object.assign(new Error(`unexpected method ${method}`), { code: -32601 }));
    const [call] = params as [{ data: Hex }];
    const { args } = decodeFunctionData({ abi: klerosLiquidAbi, data: call.data });
    const disputeId = args[0] as bigint;
    const attempt = reads.get(disputeId) ?? 0;
    reads.set(disputeId, attempt + 1);
    const error = failure(disputeId, attempt);
    if (error !== null) return Promise.reject(error);
    if (disputeId >= count) return Promise.reject(Object.assign(new Error("execution reverted"), { code: 3 }));
    return Promise.resolve(encodeFunctionResult({ abi: klerosLiquidAbi, functionName: "disputes", result: [1n, ARBITRATED, 2n, 4, 1_600_000_000n, 3n, 0n, true] }));
  };
  const client = createPublicClient({ transport: custom({ request }, { retryCount: 0 }) });
  return { reader: { chainId: 1, chain, arbitrator, block: 20_000_000n, client }, reads };
}

describe("dispute count (C6 enumeration of every existing dispute)", () => {
  it("counts the disputes of an arbitrator for many sizes", async () => {
    for (const count of [0n, 1n, 2n, 3n, 452n, 1026n, 1691n]) expect(await countDisputes(upTo(count))).toBe(count);
  });

  it("propagates a failed read instead of shortening the count", async () => {
    await expect(countDisputes((id) => (id < 4n ? Promise.resolve(true) : Promise.reject(new Error("rpc down"))))).rejects.toThrow("rpc down");
  });

  it("C6: the dispute count retries a transient read failure instead of aborting the run", async () => {
    const { reader, reads } = mainnetReader(452n, (disputeId, attempt) => (disputeId === 256n && attempt < 2 ? rateLimited() : null));
    expect(await countDisputes(disputeExists(reader, NO_BACKOFF))).toBe(452n);
    expect(reads.get(256n)).toBe(3);
    expect([...reads].filter(([disputeId]) => disputeId !== 256n).every(([, count]) => count === 1)).toBe(true);
  });

  it("C6: the dispute count still rejects, never shortens, when every attempt fails", async () => {
    const { reader, reads } = mainnetReader(452n, (disputeId) => (disputeId >= 4n ? rateLimited() : null));
    const failure: unknown = await countDisputes(disputeExists(reader, NO_BACKOFF)).then(
      (count) => count,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    const message = failure instanceof Error ? failure.message : "";
    expect(message).toContain("Could not read dispute 4 after 4 attempts");
    expect(message).toContain("HTTP 429");
    expect(message).not.toContain("secret-key");
    expect(reads.get(4n)).toBe(4);
  });

  it("C6: a chain without an arbitrator rejects at once", async () => {
    const { reader, reads } = mainnetReader(452n, () => null);
    await expect(disputeExists({ ...reader, chainId: 137 }, NO_BACKOFF)(0n)).rejects.toThrow("Chain 137 has no arbitrator.");
    expect(reads.size).toBe(0);
  });
});
