import { createPublicClient, custom } from "viem";
import { describe, expect, it } from "vitest";
import { createPinnedClient, pinParams } from "./pinnedClient";

const BLOCK = 0x1234n;

describe("pinned read client (reproducible outputs at a recorded block)", () => {
  it("pins eth_call at latest and when the block is absent", () => {
    expect(pinParams("eth_call", [{ to: "0x1" }, "latest"], BLOCK)).toEqual([{ to: "0x1" }, "0x1234"]);
    expect(pinParams("eth_call", [{ to: "0x1" }], BLOCK)).toEqual([{ to: "0x1" }, "0x1234"]);
  });

  it("keeps an explicit block number", () => {
    expect(pinParams("eth_getCode", ["0x1", "0x10"], BLOCK)).toEqual(["0x1", "0x10"]);
  });

  it("pins eth_getStorageAt's third parameter", () => {
    expect(pinParams("eth_getStorageAt", ["0x1", "0x0", "latest"], BLOCK)).toEqual(["0x1", "0x0", "0x1234"]);
  });

  it("pins the moving end of a log filter and leaves a block-hash filter alone", () => {
    expect(pinParams("eth_getLogs", [{ address: "0x1", fromBlock: "0x1", toBlock: "latest" }], BLOCK)).toEqual([{ address: "0x1", fromBlock: "0x1", toBlock: "0x1234" }]);
    expect(pinParams("eth_getLogs", [{ address: "0x1", fromBlock: "0x1" }], BLOCK)).toEqual([{ address: "0x1", fromBlock: "0x1", toBlock: "0x1234" }]);
    expect(pinParams("eth_getLogs", [{ blockHash: "0xab" }], BLOCK)).toEqual([{ blockHash: "0xab" }]);
  });

  it("pins eth_getBlockByNumber at latest", () => {
    expect(pinParams("eth_getBlockByNumber", ["latest", false], BLOCK)).toEqual(["0x1234", false]);
    expect(pinParams("eth_getBlockByNumber", ["0x5", false], BLOCK)).toEqual(["0x5", false]);
  });

  it("answers eth_blockNumber with the pinned block and forwards reads pinned", async () => {
    const calls: { method: string; params?: unknown }[] = [];
    const base = createPublicClient({
      transport: custom({
        request: ({ method, params }: { method: string; params?: unknown }) => {
          calls.push({ method, params });
          return Promise.resolve("0x");
        },
      }),
    });
    const client = createPinnedClient(base, BLOCK);
    expect(await client.getBlockNumber()).toBe(BLOCK);
    await client.getCode({ address: "0x0000000000000000000000000000000000000001" });
    expect(calls).toEqual([{ method: "eth_getCode", params: ["0x0000000000000000000000000000000000000001", "0x1234"] }]);
  });
});
