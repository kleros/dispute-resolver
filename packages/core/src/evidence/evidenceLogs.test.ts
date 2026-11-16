import { createPublicClient, custom, numberToHex, pad, ResponseBodyTooLargeError, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import refusal from "../rpc/__fixtures__/gnosis-crowded-logs-refusal.json";
import { isTooManyResultsError } from "../rpc/rangeLimit";
import type { Address, ReadClient } from "../types";
import { scanEvidenceLogs } from "./events";
import { loadEvidence } from "./index";
import { evidenceLog, fakeFetcher, type RpcLog } from "../test/evidence/testHelpers";
import { matchesFilter, rangeRefusal, type LogsRequest } from "../test/rpc/testHelpers";

const ARBITRATOR: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const ARBITRABLE: Address = "0x1111111111111111111111111111111111111111";
const PARTY: Address = "0x2222222222222222222222222222222222222222";
const GROUP = 9n;
const CID = "QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA";
const GATEWAY = "https://cdn.kleros.link";
const FROM_BLOCK = 1_000_000n;
const HEAD = 1_049_999n;
/** The node refuses any answer holding more logs than this, whatever the block range. */
const MAX_RESULTS = 6;

type Answer = (request: LogsRequest) => readonly RpcLog[] | Error;

/** A node answering the head, block timestamps and `eth_getLogs` as `answer` says, recording each `eth_getLogs` filter. */
function evidenceNode(answer: Answer): { readonly client: ReadClient; readonly requests: LogsRequest[] } {
  const requests: LogsRequest[] = [];
  const request = ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    if (method === "eth_blockNumber") return Promise.resolve(numberToHex(HEAD));
    if (method === "eth_getBlockByNumber") {
      const [number] = params as [Hex];
      return Promise.resolve({ number, timestamp: numberToHex(BigInt(number) * 5n), hash: pad(number, { size: 32 }) });
    }
    if (method !== "eth_getLogs") return Promise.reject(new Error(`unexpected method ${method}`));
    const [filter] = params as [{ address: string; topics?: (string | string[] | null)[]; fromBlock: Hex; toBlock: Hex }];
    const logsRequest: LogsRequest = { address: filter.address, topics: filter.topics ?? [], fromBlock: BigInt(filter.fromBlock), toBlock: BigInt(filter.toBlock) };
    requests.push(logsRequest);
    const result = answer(logsRequest);
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  };
  return { client: createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }), requests };
}

/** The Gnosis read RPC's refusal of an answer holding more results than it returns, as recorded. */
function resultCountRefusal(): Error {
  return Object.assign(new Error(refusal.error.message), { code: refusal.error.code, data: refusal.error.data });
}

function bodySizeRefusal(): Error {
  return new ResponseBodyTooLargeError({ maxSize: 10_485_760, size: 10_485_761 });
}

function crowdedNode(logs: readonly RpcLog[], refuse: () => Error) {
  return evidenceNode((request) => {
    const matched = logs.filter((log) => matchesFilter(log, request));
    return matched.length > MAX_RESULTS ? refuse() : matched;
  });
}

/** Evidence entry `n` of `blocks`, in chain order, with its own document. */
function entries(blocks: readonly bigint[]): RpcLog[] {
  const inBlock = new Map<bigint, number>();
  return blocks.map((blockNumber, index) => {
    const logIndex = inBlock.get(blockNumber) ?? 0;
    inBlock.set(blockNumber, logIndex + 1);
    return evidenceLog({ arbitrable: ARBITRABLE, arbitrator: ARBITRATOR, evidenceGroupId: GROUP, party: PARTY, uri: `/ipfs/${CID}/${String(index)}`, blockNumber, logIndex });
  });
}

function blockRun(first: bigint, count: number, perBlock: number): bigint[] {
  return Array.from({ length: count * perBlock }, (_, index) => first + BigInt(Math.floor(index / perBlock)));
}

/** Four neighbouring blocks of three entries each: no window of four blocks or more fits under the node's cap. */
const CROWDED = entries([1_005_000n, ...blockRun(1_020_040n, 4, 3), 1_030_000n, 1_045_000n]);

function context(client: ReadClient, fetcher = fakeFetcher(documents(CROWDED)).fetcher) {
  return { client, fetcher, gateway: GATEWAY, arbitrable: ARBITRABLE, arbitrator: ARBITRATOR, evidenceGroupId: GROUP, fromBlock: FROM_BLOCK } as const;
}

function documents(logs: readonly RpcLog[]): Record<string, string> {
  return Object.fromEntries(logs.map((_, index) => [`${GATEWAY}/ipfs/${CID}/${String(index)}`, JSON.stringify({ name: `Entry ${String(index)}` })]));
}

function chainPositions(logs: readonly RpcLog[]): [bigint, number][] {
  return logs.map((log) => [BigInt(log.blockNumber), Number(log.logIndex)]);
}

function size(request: LogsRequest): bigint {
  return request.toBlock - request.fromBlock + 1n;
}

describe("the evidence read over a crowded block window", () => {
  it.each([
    ["more results than the RPC returns at once", resultCountRefusal],
    ["an answer larger than the read client accepts", bodySizeRefusal],
  ])("a 100-block window refused for %s is read in pieces, and every entry comes back in chain order", async (_refusal, refuse) => {
    const { client, requests } = crowdedNode(CROWDED, refuse);
    const outcome = await loadEvidence(context(client));
    if (!outcome.ok) throw new Error(outcome.error.message);

    expect(outcome.value.logs.map((log) => [log.blockNumber, log.logIndex])).toEqual(chainPositions(CROWDED));
    expect(outcome.value.entries.map((entry) => (entry.status === "shown" ? entry.item.title : entry.status))).toEqual(
      [14, 13, 10, 11, 12, 7, 8, 9, 4, 5, 6, 1, 2, 3, 0].map((index) => `Entry ${String(index)}`),
    );
    expect(requests.some((request) => size(request) === 100n)).toBe(true);
    expect(requests.filter((request) => size(request) === 1n).map((request) => request.fromBlock)).toEqual([1_020_040n, 1_020_041n, 1_020_042n, 1_020_043n]);
  });

  it("a single block still refused for too many results rejects, and the evidence stays unavailable", async () => {
    const oneBlock = entries(blockRun(1_020_041n, 1, MAX_RESULTS + 1));
    const { client, requests } = crowdedNode(oneBlock, resultCountRefusal);
    await expect(scanEvidenceLogs(context(client))).rejects.toSatisfy(isTooManyResultsError);
    expect(requests).toContainEqual(expect.objectContaining({ fromBlock: 1_020_041n, toBlock: 1_020_041n }));

    const again = crowdedNode(oneBlock, resultCountRefusal);
    const outcome = await loadEvidence(context(again.client, fakeFetcher(documents(oneBlock)).fetcher));
    expect(!outcome.ok && outcome.error.code).toBe("rpc-error");
  });

  it("a read nothing refuses for too many results sends the same requests as before: the whole range once, or windows of a range-capped node", async () => {
    const whole = evidenceNode((request) => CROWDED.filter((log) => matchesFilter(log, request)));
    expect(await scanEvidenceLogs(context(whole.client))).toHaveLength(CROWDED.length);
    expect(whole.requests.map((request) => [request.fromBlock, request.toBlock])).toEqual([[FROM_BLOCK, HEAD]]);

    const capped = evidenceNode((request) => (size(request) > 10_000n ? rangeRefusal() : CROWDED.filter((log) => matchesFilter(log, request))));
    expect(await scanEvidenceLogs(context(capped.client))).toHaveLength(CROWDED.length);
    expect(capped.requests.map((request) => [request.fromBlock, request.toBlock])).toEqual([
      [FROM_BLOCK, HEAD],
      ...[0n, 1n, 2n, 3n, 4n].map((window) => [FROM_BLOCK + window * 10_000n, FROM_BLOCK + window * 10_000n + 9_999n]),
    ]);
  });
});
