import { getAddress, numberToHex, pad, parseAbiItem } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../appeals/__fixtures__/dispute-1170-unslashed.json";
import type { Address, Hex, ReadClient } from "../types";
import { createReadClient, createRequestBudget, getLogsChunked, isLookupLimitError, isRangeLimitError, isTooManyLogsError } from "./index";
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
