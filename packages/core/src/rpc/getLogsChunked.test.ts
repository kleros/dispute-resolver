import { getAddress, numberToHex, pad, parseAbiItem, ResponseBodyTooLargeError } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../appeals/__fixtures__/dispute-1170-unslashed.json";
import refusal from "./__fixtures__/gnosis-crowded-logs-refusal.json";
import type { Address, Hex, ReadClient } from "../types";
import { createReadClient, createRequestBudget, getLogsChunked, isLookupLimitError, isRangeLimitError, isTooManyLogsError } from "./index";
import { isTooManyResultsError } from "./rangeLimit";
import {
  cappedNode,
  fakeLogsClient,
  logsRange,
  matchesFilter,
  rangeRefusal,
  rpcCalls,
  rpcError,
  rpcLog,
  stubEndpoint,
  type JsonRpcCall,
  type LogsRequest,
  type Reply,
  type RpcLog,
} from "../test/rpc/testHelpers";
import { chainOf } from "../test/chains/testHelpers";
import type { BudgetedReadClientOptions } from "./types";

/** The 27 recorded funding events of mainnet dispute 1170 (Unslashed), read at block 26,189,725, as RPC logs. */
const DISPUTE_1170_LOGS: readonly RpcLog[] = fixture.fundingEvents.map((event) =>
  rpcLog({ ...event, topics: event.topics as Hex[], data: event.data as Hex, transactionHash: event.transactionHash as Hex }),
);

const DISPUTE_1170 = {
  arbitrable: fixture.arbitrable as Address,
  contributionTopic: fixture.topics.contrib as Hex,
  fromBlock: BigInt(fixture.scan.unslashedFromBlock),
  toBlock: BigInt(fixture.scan.toBlock),
  contributions: fixture.fundingEvents.filter((event) => event.type === "Contribution"),
};

const contribution = parseAbiItem("event Contribution(uint256 indexed _localDisputeID, uint256 indexed _round, uint256 ruling, address indexed _contributor, uint256 _amount)");
const arbitrable = DISPUTE_1170.arbitrable;
const scan = { address: arbitrable, event: contribution, fromBlock: DISPUTE_1170.fromBlock, toBlock: DISPUTE_1170.toBlock } as const;

const expectedContributions = DISPUTE_1170.contributions.map((event) => [BigInt(event.blockNumber), event.logIndex]);

function positions(logs: readonly { blockNumber: bigint; logIndex: number }[]): [bigint, number][] {
  return logs.map((log) => [log.blockNumber, log.logIndex]);
}

function size(request: LogsRequest): bigint {
  return request.toBlock - request.fromBlock + 1n;
}

let endpointCounter = 0;

/** The production read client of mainnet over a fake endpoint at a URL of its own (viem keeps state per URL). */
function mainnetReadClient(options?: BudgetedReadClientOptions): ReadClient {
  endpointCounter += 1;
  const resolution = createReadClient(chainOf(1), { REACT_APP_WEB3_PROVIDER_URL: `https://read.rpc.example/logs/${String(endpointCounter)}` }, options);
  if (resolution.status !== "ok") throw new Error("expected a configured client");
  return resolution.client;
}

const RANGE_REFUSAL: Reply = { error: { code: -32005, message: "query returned more than 10000 results" } };

function cappedReply(call: JsonRpcCall): Reply {
  const { fromBlock, toBlock } = logsRange(call);
  return toBlock - fromBlock + 1n > 10_000n ? RANGE_REFUSAL : { result: [] };
}

describe("getLogsChunked over the production read transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("every request spends the shared budget, the whole-range attempt included", async () => {
    const endpoint = stubEndpoint(cappedReply);
    const budget = createRequestBudget({ maxRequests: 1, deadlineMs: 90_000 });
    const client = mainnetReadClient({ budget });
    await expect(getLogsChunked(client, { ...scan, fromBlock: 0n, toBlock: 9_999n })).resolves.toEqual([]);
    await expect(getLogsChunked(client, { ...scan, fromBlock: 0n, toBlock: 9_999n })).rejects.toSatisfy(isLookupLimitError);
    expect(rpcCalls(endpoint)).toHaveLength(1);
  });

  it("budget exhaustion stops a windowed scan with a LookupLimitError, never treated as a refusal", async () => {
    const endpoint = stubEndpoint(cappedReply);
    const budget = createRequestBudget({ maxRequests: 5, deadlineMs: 90_000 });
    const client = mainnetReadClient({ budget });
    await expect(getLogsChunked(client, { ...scan, fromBlock: 0n, toBlock: 349_999n })).rejects.toSatisfy(isLookupLimitError);
    expect(rpcCalls(endpoint)).toHaveLength(5);
  });

  it("windows are fetched `concurrency` at a time, each in its own HTTP request", async () => {
    let inFlight = 0;
    let peak = 0;
    const endpoint = stubEndpoint(async (call) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return cappedReply(call);
    });
    const client = mainnetReadClient();
    await getLogsChunked(client, { ...scan, fromBlock: 14_600_000n, toBlock: 14_950_000n });
    expect(peak).toBe(8);
    expect(endpoint.posts.every((post) => post.calls.length === 1)).toBe(true);
    expect(endpoint.posts).toHaveLength(1 + 36);
  });

  it("a window that times out does not time out the windows fetched beside it", async () => {
    const slowWindow = 40_000n;
    let slowCalls = 0;
    const endpoint = stubEndpoint((call) => {
      const { fromBlock, toBlock } = logsRange(call);
      const slow = fromBlock === slowWindow && toBlock === slowWindow + 9_999n;
      if (slow) slowCalls += 1;
      const reply: Reply = slow ? "hang" : cappedReply(call);
      return reply;
    });
    const client = mainnetReadClient({ timeoutMs: 50 });
    await expect(getLogsChunked(client, { ...scan, fromBlock: 0n, toBlock: 79_999n })).resolves.toEqual([]);
    expect(slowCalls).toBe(1);
    const windowsBeforeTheSlowOne = rpcCalls(endpoint).filter((call) => logsRange(call).toBlock < slowWindow);
    expect(windowsBeforeTheSlowOne.map((call) => logsRange(call).fromBlock)).toEqual([0n, 10_000n, 20_000n, 30_000n]);
  });
});

describe("getLogsChunked", () => {
  it("an empty range returns no logs without requests", async () => {
    const { client, requests } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 10_000n));
    expect(await getLogsChunked(client, { ...scan, fromBlock: 10n, toBlock: 9n })).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it("tries the whole range from the round's start to the head in one request first", async () => {
    const { client, requests } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 1n << 40n));
    const logs = await getLogsChunked(client, scan);
    expect(requests).toEqual([{ address: arbitrable, topics: [DISPUTE_1170.contributionTopic], fromBlock: scan.fromBlock, toBlock: scan.toBlock }]);
    expect(positions(logs)).toEqual(expectedContributions);
    expect(logs[0]?.args).toEqual({
      _localDisputeID: 0n,
      _round: 1n,
      ruling: 1n,
      _contributor: getAddress("0xadbab4f38ff9dcd71886f43b148bcad4a3081fb9"),
      _amount: 1_008_000_000_000_000_000n,
    });
  });

  it("a refused range is scanned forward in 10,000-block windows, 8 at a time, and every log is returned", async () => {
    const fromBlock = 14_600_000n;
    const toBlock = 14_950_000n;
    const { client, requests } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 10_000n));
    const logs = await getLogsChunked(client, { ...scan, fromBlock, toBlock });

    expect(positions(logs)).toEqual(expectedContributions);
    const [whole, ...windows] = requests;
    expect(whole).toMatchObject({ fromBlock, toBlock });
    expect(windows).toHaveLength(36);
    expect(windows.slice(0, 8).map((window) => window.fromBlock)).toEqual(Array.from({ length: 8 }, (_, i) => fromBlock + 10_000n * BigInt(i)));
    expect(windows.every((window) => size(window) <= 10_000n)).toBe(true);
    expect(windows.at(-1)).toMatchObject({ fromBlock: 14_950_000n, toBlock });
  });

  it("a refused window shrinks by the shrink factor and the scan resumes at that window", async () => {
    const fromBlock = 14_600_000n;
    const toBlock = 14_700_000n;
    const { client, requests } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 2_000n));
    const logs = await getLogsChunked(client, { ...scan, fromBlock, toBlock });

    expect(positions(logs)).toEqual(expectedContributions.filter(([block]) => (block ?? 0n) <= toBlock));
    const sizes = requests.slice(1).map(size);
    expect(sizes.slice(0, 8)).toEqual(Array.from({ length: 8 }, () => 10_000n));
    expect(sizes.slice(8).every((windowSize) => windowSize <= 2_000n)).toBe(true);
    expect(requests[9]?.fromBlock).toBe(fromBlock);
  });

  it("a scan whose windows end one block before the head still fetches the head block", async () => {
    const toBlock = 14_634_725n;
    const { client } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 10_000n));
    const logs = await getLogsChunked(client, { ...scan, fromBlock: toBlock - 80_000n, toBlock });
    expect(positions(logs)).toEqual(expectedContributions.filter(([block]) => (block ?? 0n) <= toBlock));
  });

  it("shrinks a range no larger than the first window before splitting it", async () => {
    const { client, requests } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 1_000n));
    await getLogsChunked(client, { ...scan, fromBlock: 14_634_000n, toBlock: 14_638_999n });
    expect(requests.slice(1).map(size)).toEqual([2_000n, 2_000n, 1_000n, ...Array.from({ length: 12 }, () => 400n), 200n]);
  });

  it("a window refused at minWindowSize rethrows the range error", async () => {
    const { client } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 50n));
    const failure = getLogsChunked(client, { ...scan, fromBlock: 14_600_000n, toBlock: 14_700_000n });
    await expect(failure).rejects.toSatisfy(isRangeLimitError);
  });

  it("a refused single-block range is rethrown without splitting", async () => {
    const { client, requests } = fakeLogsClient(() => Promise.resolve(rangeRefusal()));
    await expect(getLogsChunked(client, { ...scan, fromBlock: 14_634_725n, toBlock: 14_634_725n })).rejects.toSatisfy(isRangeLimitError);
    expect(requests).toHaveLength(1);
  });

  it("an error that is not a range limit is rethrown, never split", async () => {
    const { client, requests } = fakeLogsClient(() => Promise.resolve(rpcError(-32000, "header not found")));
    await expect(getLogsChunked(client, scan)).rejects.toThrow(/header not found/);
    expect(requests).toHaveLength(1);
  });

  it("an error that is not a range limit in a window is rethrown", async () => {
    const node = cappedNode(DISPUTE_1170_LOGS, 10_000n);
    const { client, requests } = fakeLogsClient((request) => (request.fromBlock === 14_620_000n ? Promise.resolve(rpcError(-32000, "header not found")) : node(request)));
    await expect(getLogsChunked(client, { ...scan, fromBlock: 14_600_000n, toBlock: 14_950_000n })).rejects.toThrow(/header not found/);
    expect(requests.filter((request) => request.fromBlock === 14_620_000n)).toHaveLength(1);
  });

  it("drops removed logs, deduplicates by (transactionHash, logIndex) and sorts by block and log index", async () => {
    const wanted = DISPUTE_1170_LOGS.filter((log) =>
      matchesFilter(log, { address: arbitrable, topics: [DISPUTE_1170.contributionTopic], fromBlock: scan.fromBlock, toBlock: scan.toBlock }),
    );
    const [first, second] = wanted;
    if (first === undefined || second === undefined) throw new Error("fixture has fewer than two contributions");
    const duplicate: RpcLog = { ...first, transactionHash: first.transactionHash.toUpperCase().replace("0X", "0x") as RpcLog["transactionHash"] };
    const removed: RpcLog = { ...second, logIndex: numberToHex(999), removed: true };
    const sameBlockLater: RpcLog = { ...first, logIndex: numberToHex(Number(first.logIndex) + 1) };
    const { client } = fakeLogsClient(() => Promise.resolve([sameBlockLater, ...[...wanted].reverse(), duplicate, removed]));
    const logs = await getLogsChunked(client, scan);
    const [firstPosition, ...rest] = expectedContributions;
    expect(positions(logs)).toEqual([firstPosition, [BigInt(first.blockNumber), Number(sameBlockLater.logIndex)], ...rest]);
  });

  it("logs are deduplicated across windows", async () => {
    const node = cappedNode(DISPUTE_1170_LOGS, 10_000n);
    const { client } = fakeLogsClient(async (request) => {
      const answer = await node(request);
      if (answer instanceof Error) return answer;
      return [...answer, ...DISPUTE_1170_LOGS.filter((log) => matchesFilter(log, { ...request, fromBlock: 0n, toBlock: 1n << 40n }))];
    });
    const logs = await getLogsChunked(client, { ...scan, fromBlock: 14_600_000n, toBlock: 14_950_000n });
    expect(positions(logs)).toEqual(expectedContributions);
  });

  it("passes the indexed arguments to the node as topics", async () => {
    const { client, requests } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 1n << 40n));
    const logs = await getLogsChunked(client, { ...scan, args: { _localDisputeID: 0n, _round: 6n } });
    expect(requests[0]?.topics).toEqual([DISPUTE_1170.contributionTopic, pad("0x0"), pad("0x6"), null]);
    const roundSix = DISPUTE_1170.contributions.filter((event) => event.decoded?.round === "6");
    expect(roundSix.length).toBeGreaterThan(0);
    expect(positions(logs)).toEqual(roundSix.map((event) => [BigInt(event.blockNumber), event.logIndex]));
  });

  it("an aborted signal stops the scan before the next request", async () => {
    const { client, requests } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 10_000n));
    const aborted = getLogsChunked(client, scan, { signal: AbortSignal.abort(new Error("left the page")) });
    await expect(aborted).rejects.toThrow(/left the page/);
    expect(requests).toHaveLength(0);

    const controller = new AbortController();
    const node = cappedNode(DISPUTE_1170_LOGS, 10_000n);
    const { client: slow, requests: slowRequests } = fakeLogsClient((request) => {
      controller.abort(new Error("left the page"));
      return node(request);
    });
    await expect(getLogsChunked(slow, { ...scan, fromBlock: 14_600_000n, toBlock: 14_950_000n }, { signal: controller.signal })).rejects.toThrow(/left the page/);
    expect(slowRequests).toHaveLength(1);
  });
});

describe("getLogsChunked with a log cap", () => {
  it("returns every log when they fit under the cap", async () => {
    const { client } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 1n << 40n));
    const logs = await getLogsChunked(client, scan, { maxLogs: expectedContributions.length });
    expect(positions(logs)).toEqual(expectedContributions);
  });

  it("refuses a whole-range answer over the cap without another request", async () => {
    const { client, requests } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 1n << 40n));
    await expect(getLogsChunked(client, scan, { maxLogs: 2 })).rejects.toSatisfy(isTooManyLogsError);
    expect(requests).toHaveLength(1);
  });

  it("stops a windowed scan once more logs than the cap matched, before the remaining windows", async () => {
    const { client, requests } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 10_000n));
    const failure = getLogsChunked(client, { ...scan, fromBlock: 14_600_000n, toBlock: 14_950_000n }, { maxLogs: 1 });
    await expect(failure).rejects.toSatisfy(isTooManyLogsError);
    expect(requests.length).toBeLessThan(1 + 36);
  });

  it("counts a log the provider returns twice once", async () => {
    const [first] = DISPUTE_1170_LOGS.filter((log) =>
      matchesFilter(log, { address: arbitrable, topics: [DISPUTE_1170.contributionTopic], fromBlock: scan.fromBlock, toBlock: scan.toBlock }),
    );
    if (first === undefined) throw new Error("fixture has no contribution");
    const { client } = fakeLogsClient(() => Promise.resolve([first, first]));
    expect(await getLogsChunked(client, scan, { maxLogs: 1 })).toHaveLength(1);
  });

  it("the cap error is never a range or budget error, so nothing splits or retries it", async () => {
    const { client } = fakeLogsClient(cappedNode(DISPUTE_1170_LOGS, 1n << 40n));
    const error: unknown = await getLogsChunked(client, scan, { maxLogs: 0 }).catch((caught: unknown) => caught);
    expect(isTooManyLogsError(error)).toBe(true);
    expect(isRangeLimitError(error)).toBe(false);
    expect(isLookupLimitError(error)).toBe(false);
  });
});

/** The Gnosis read RPC's refusal of an answer holding more results than it returns, as recorded. */
function crowdedRefusal(): Error {
  return Object.assign(new Error(refusal.error.message), { code: refusal.error.code, data: refusal.error.data });
}

/** A node without a block-range cap that refuses any answer holding more than `maxResults` logs. */
function resultCappedNode(logs: readonly RpcLog[], maxResults: number): (request: LogsRequest) => Promise<RpcLog[] | Error> {
  return (request) => {
    const matched = logs.filter((log) => matchesFilter(log, request));
    return Promise.resolve(matched.length > maxResults ? crowdedRefusal() : matched);
  };
}

function contributionsAt(blocks: readonly bigint[]): RpcLog[] {
  return blocks.map((block, index) => rpcLog({ address: arbitrable, topics: [DISPUTE_1170.contributionTopic], data: "0x", blockNumber: block, logIndex: index }));
}

function blockRun(first: bigint, count: number, perBlock: number): bigint[] {
  return Array.from({ length: count * perBlock }, (_, index) => first + BigInt(Math.floor(index / perBlock)));
}

function sortedPositions(logs: readonly RpcLog[]): [bigint, number][] {
  const byPosition = ([a, i]: [bigint, number], [b, j]: [bigint, number]): number => {
    if (a !== b) return a < b ? -1 : 1;
    return i - j;
  };
  return logs.map((log): [bigint, number] => [BigInt(log.blockNumber), Number(log.logIndex)]).sort(byPosition);
}

const crowdedScan = { ...scan, fromBlock: 1_000_000n, toBlock: 1_049_999n } as const;

describe("getLogsChunked reading crowded windows in pieces", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Four neighbouring blocks of three logs each: no window of four blocks or more fits under a cap of six results. */
  const crowded = contributionsAt([1_005_000n, ...blockRun(1_020_040n, 4, 3), 1_030_000n, 1_045_000n]);

  it("a 100-block window refused for too many results is read again in pieces of 20, 4 and 1 blocks, and every log is returned in order", async () => {
    const { client, requests } = fakeLogsClient(resultCappedNode(crowded, 6));
    const logs = await getLogsChunked(client, crowdedScan, { splitCrowdedWindows: true });

    expect(positions(logs)).toEqual(sortedPositions(crowded));
    const crowdedWindow = requests.findIndex((request) => request.fromBlock === 1_020_000n && size(request) === 100n);
    expect(crowdedWindow).toBeGreaterThan(0);
    const pieces = requests.slice(crowdedWindow + 8, crowdedWindow + 8 + 14);
    expect(pieces.map((piece) => [piece.fromBlock, size(piece)])).toEqual([
      ...[0n, 20n, 40n, 60n, 80n].map((offset) => [1_020_000n + offset, 20n]),
      ...[0n, 4n, 8n, 12n, 16n].map((offset) => [1_020_040n + offset, 4n]),
      ...[0n, 1n, 2n, 3n].map((offset) => [1_020_040n + offset, 1n]),
    ]);
  });

  it("the scan carries on at its normal window size after a crowded window", async () => {
    const { client, requests } = fakeLogsClient(resultCappedNode(crowded, 6));
    await getLogsChunked(client, crowdedScan, { splitCrowdedWindows: true });

    const lastPiece = requests.map(size).lastIndexOf(1n);
    const after = requests.slice(lastPiece + 1);
    expect(after[0]).toMatchObject({ fromBlock: 1_020_800n, toBlock: 1_030_799n });
    expect(after.every((request) => request.fromBlock > 1_020_043n)).toBe(true);
    expect(after.at(-1)).toMatchObject({ toBlock: crowdedScan.toBlock });
  });

  it("reads a range of 100 blocks or fewer refused for too many results in pieces smaller than the range", async () => {
    const hundred = fakeLogsClient(resultCappedNode(crowded, 6));
    const fromHundred = await getLogsChunked(hundred.client, { ...scan, fromBlock: 1_020_000n, toBlock: 1_020_099n }, { splitCrowdedWindows: true });
    expect(positions(fromHundred)).toEqual(sortedPositions(crowded).filter(([block]) => block >= 1_020_000n && block <= 1_020_099n));
    expect(hundred.requests.slice(1, 6).map(size)).toEqual([20n, 20n, 20n, 20n, 20n]);

    const fifteen = fakeLogsClient(resultCappedNode(crowded, 6));
    const fromFifteen = await getLogsChunked(fifteen.client, { ...scan, fromBlock: 1_020_030n, toBlock: 1_020_044n }, { splitCrowdedWindows: true });
    expect(positions(fromFifteen)).toEqual(sortedPositions(crowded).filter(([block]) => block >= 1_020_030n && block <= 1_020_044n));
    expect(fifteen.requests.slice(1, 5).map(size)).toEqual([4n, 4n, 4n, 3n]);
  });

  it("a single block still refused for too many results is rethrown", async () => {
    const { client, requests } = fakeLogsClient(resultCappedNode(contributionsAt(blockRun(1_020_041n, 1, 7)), 6));
    await expect(getLogsChunked(client, crowdedScan, { splitCrowdedWindows: true })).rejects.toSatisfy(isTooManyResultsError);
    expect(requests).toContainEqual(expect.objectContaining({ fromBlock: 1_020_041n, toBlock: 1_020_041n }));

    const single = fakeLogsClient(resultCappedNode(contributionsAt(blockRun(1_020_041n, 1, 7)), 6));
    await expect(getLogsChunked(single.client, { ...scan, fromBlock: 1_020_041n, toBlock: 1_020_041n }, { splitCrowdedWindows: true })).rejects.toSatisfy(isTooManyResultsError);
    expect(single.requests).toHaveLength(1);
  });

  it.each([
    ["a timeout", "request timed out"],
    ["a block-range cap", "block range is too wide"],
  ])("%s at the 100-block floor is rethrown as today, never read in pieces", async (_name, message) => {
    const { client, requests } = fakeLogsClient(() => Promise.resolve(rpcError(-32000, message)));
    await expect(getLogsChunked(client, crowdedScan, { splitCrowdedWindows: true })).rejects.toThrow(message);
    expect(requests.every((request) => size(request) >= 100n)).toBe(true);
    expect(requests.some((request) => size(request) === 100n)).toBe(true);
  });

  it("a timeout on a piece is rethrown, never split further", async () => {
    const node = resultCappedNode(crowded, 6);
    const { client, requests } = fakeLogsClient((request) => (size(request) === 4n ? Promise.resolve(rpcError(-32000, "request timed out")) : node(request)));
    await expect(getLogsChunked(client, crowdedScan, { splitCrowdedWindows: true })).rejects.toThrow("request timed out");
    expect(requests.some((request) => size(request) === 1n)).toBe(false);
  });

  it("a window whose answer is larger than the read client accepts is read in pieces too, and a single block still too large is rethrown", async () => {
    const tooLarge = (logs: readonly RpcLog[]) => (request: LogsRequest) => {
      const matched = logs.filter((log) => matchesFilter(log, request));
      return Promise.resolve(matched.length > 6 ? new ResponseBodyTooLargeError({ maxSize: 6, size: matched.length }) : matched);
    };
    const { client, requests } = fakeLogsClient(tooLarge(crowded));
    expect(positions(await getLogsChunked(client, crowdedScan, { splitCrowdedWindows: true }))).toEqual(sortedPositions(crowded));
    expect(requests.filter((request) => size(request) === 1n)).toHaveLength(4);

    const single = fakeLogsClient(tooLarge(contributionsAt(blockRun(1_020_041n, 1, 7))));
    await expect(getLogsChunked(single.client, crowdedScan, { splitCrowdedWindows: true })).rejects.toBeInstanceOf(ResponseBodyTooLargeError);

    const withoutOption = fakeLogsClient(tooLarge(crowded));
    await expect(getLogsChunked(withoutOption.client, crowdedScan)).rejects.toBeInstanceOf(ResponseBodyTooLargeError);
    expect(withoutOption.requests.every((request) => size(request) >= 100n)).toBe(true);
  });

  it("a wider range refused with result-count wording that is not a range limit is rethrown after one request, never read in pieces", async () => {
    const { client, requests } = fakeLogsClient(() => Promise.resolve(Object.assign(new Error("server error"), { code: -32000, data: refusal.error.data })));
    await expect(getLogsChunked(client, crowdedScan, { splitCrowdedWindows: true })).rejects.toSatisfy(isTooManyResultsError);
    expect(requests).toHaveLength(1);
  });

  it("without the option, a window refused for too many results at the floor is rethrown", async () => {
    const { client, requests } = fakeLogsClient(resultCappedNode(crowded, 6));
    await expect(getLogsChunked(client, crowdedScan)).rejects.toSatisfy(isTooManyResultsError);
    expect(requests.every((request) => size(request) >= 100n)).toBe(true);

    const hundred = fakeLogsClient(resultCappedNode(crowded, 6));
    await expect(getLogsChunked(hundred.client, { ...scan, fromBlock: 1_020_000n, toBlock: 1_020_099n })).rejects.toSatisfy(isTooManyResultsError);
    expect(hundred.requests).toHaveLength(1);
  });

  it("an aborted signal stops reading the pieces of a crowded window", async () => {
    const controller = new AbortController();
    const node = resultCappedNode(crowded, 6);
    const { client, requests } = fakeLogsClient((request) => {
      if (size(request) === 20n) controller.abort(new Error("left the page"));
      return node(request);
    });
    await expect(getLogsChunked(client, crowdedScan, { signal: controller.signal, splitCrowdedWindows: true })).rejects.toThrow(/left the page/);
    expect(requests.some((request) => size(request) === 4n)).toBe(false);
  });

  it("over the production read transport, the recorded refusal is read in pieces without a retry", async () => {
    const logs = contributionsAt(blockRun(1_020_040n, 4, 3));
    const endpoint = stubEndpoint((call) => {
      const [filter] = call.params as [{ address: string; topics?: (string | null)[] }];
      const request = { address: filter.address, topics: filter.topics ?? [], ...logsRange(call) };
      const matched = logs.filter((log) => matchesFilter(log, request));
      return matched.length > 6 ? { error: refusal.error } : { result: matched };
    });
    const client = mainnetReadClient();
    const found = await getLogsChunked(client, { ...scan, fromBlock: 1_020_000n, toBlock: 1_020_099n }, { splitCrowdedWindows: true });
    expect(positions(found)).toEqual(sortedPositions(logs));
    const ranges = rpcCalls(endpoint).map((call) => logsRange(call));
    expect(ranges).toHaveLength(1 + 5 + 5 + 4);
    expect(new Set(ranges.map(({ fromBlock, toBlock }) => `${String(fromBlock)}-${String(toBlock)}`)).size).toBe(ranges.length);
  });
});
