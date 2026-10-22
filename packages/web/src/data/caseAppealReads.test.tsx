import type { AppealDecisionEvent } from "@dispute-resolver/core";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionResult, numberToHex, toFunctionSelector, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { TestDataProvider, createTestDeps, sectionReady, testFamily, testFoundLookup, type RpcHandler } from "../test/data";
import { useAppealReads, type AppealPlan } from "./caseAppealReads";
import type { CoreDeps } from "./types";

const LOCAL_ID = 7n;
const DISPUTE_START = 18_000_000n;
const DECISION_BLOCK = 18_100_000n;
const HEAD = DECISION_BLOCK + 50_000n;
const CONTRIBUTION_BLOCK = DECISION_BLOCK + 40_000n;
const CONTRIBUTOR = "0x2222222222222222222222222222222222222222";
const AMOUNT = 3n * 10n ** 18n;
const BINDING = testFoundLookup().binding;

const contributionEvent = {
  type: "event",
  name: "Contribution",
  inputs: [
    { name: "_localDisputeID", type: "uint256", indexed: true },
    { name: "_round", type: "uint256", indexed: true },
    { name: "ruling", type: "uint256", indexed: false },
    { name: "_contributor", type: "address", indexed: true },
    { name: "_amount", type: "uint256", indexed: false },
  ],
} as const;

const getMultipliers = {
  type: "function",
  name: "getMultipliers",
  stateMutability: "view",
  inputs: [],
  outputs: [
    { name: "winnerStakeMultiplier", type: "uint256" },
    { name: "loserStakeMultiplier", type: "uint256" },
    { name: "loserAppealPeriodMultiplier", type: "uint256" },
    { name: "denominator", type: "uint256" },
  ],
} as const;

interface RpcLog {
  readonly address: string;
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly blockNumber: bigint;
}

interface LogFilter {
  readonly address?: string;
  readonly topics?: readonly (Hex | readonly Hex[] | null)[];
  readonly fromBlock: Hex;
  readonly toBlock: Hex;
}

interface BlockRange {
  readonly from: bigint;
  readonly to: bigint;
}

const CONTRIBUTION_TOPIC = encodeEventTopics({ abi: [contributionEvent], eventName: "Contribution" })[0];

const contribution: RpcLog = {
  address: BINDING.arbitrated,
  topics: encodeEventTopics({ abi: [contributionEvent], eventName: "Contribution", args: { _localDisputeID: LOCAL_ID, _round: 1n, _contributor: CONTRIBUTOR } }).filter(
    (topic): topic is Hex => typeof topic === "string",
  ),
  data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [2n, AMOUNT]),
  blockNumber: CONTRIBUTION_BLOCK,
};

function topicMatches(wanted: Hex | readonly Hex[] | null | undefined, actual: Hex | undefined): boolean {
  if (wanted === null || wanted === undefined) return true;
  if (actual === undefined) return false;
  const options = typeof wanted === "string" ? [wanted] : wanted;
  return options.some((option) => option.toLowerCase() === actual.toLowerCase());
}

function logMatches(log: RpcLog, filter: LogFilter, range: BlockRange): boolean {
  if (filter.address !== undefined && filter.address.toLowerCase() !== log.address.toLowerCase()) return false;
  if (log.blockNumber < range.from || log.blockNumber > range.to) return false;
  return (filter.topics ?? []).every((wanted, index) => topicMatches(wanted, log.topics[index]));
}

function rpcLog(log: RpcLog, index: number) {
  return {
    address: log.address,
    topics: log.topics,
    data: log.data,
    blockNumber: numberToHex(log.blockNumber),
    blockHash: `0x${"ab".repeat(32)}`,
    transactionHash: `0x${(index + 1).toString(16).padStart(64, "0")}`,
    transactionIndex: "0x0",
    logIndex: numberToHex(index),
    removed: false,
  };
}

function rangeLimitError(): Error {
  return Object.assign(new Error("query returned more than 10000 results"), { code: -32005 });
}

/**
 * A chain whose arbitrable holds one `Contribution` 40,000 blocks after the appeal decision. Every `eth_getLogs` range
 * asked for `Contribution` is recorded; with `maxRange`, a longer range is refused as providers capped at 10,000 do.
 */
function fundingChain(options: { readonly maxRange?: bigint } = {}) {
  const contributionScans: BlockRange[] = [];
  const answers: Readonly<Record<string, (params: unknown) => unknown>> = {
    eth_blockNumber: () => numberToHex(HEAD),
    eth_call: (params) => {
      const [call] = params as readonly [{ readonly data?: Hex; readonly input?: Hex }];
      const data = call.data ?? call.input ?? "0x";
      if (!data.startsWith(toFunctionSelector(getMultipliers))) throw new Error(`unexpected eth_call ${data.slice(0, 10)}`);
      return encodeFunctionResult({ abi: [getMultipliers], functionName: "getMultipliers", result: [10_000n, 20_000n, 5_000n, 10_000n] });
    },
    eth_getLogs: (params) => {
      const [filter] = params as readonly [LogFilter];
      const range = { from: BigInt(filter.fromBlock), to: BigInt(filter.toBlock) };
      if (topicMatches(filter.topics?.[0], CONTRIBUTION_TOPIC)) contributionScans.push(range);
      if (options.maxRange !== undefined && range.to - range.from + 1n > options.maxRange) throw rangeLimitError();
      return [contribution].filter((log) => logMatches(log, filter, range)).map(rpcLog);
    },
  };
  const rpc: RpcHandler = ({ method, params }) => {
    const answer = answers[method];
    if (answer === undefined) throw new Error(`unexpected ${method}`);
    return answer(params);
  };
  return { deps: createTestDeps({ rpc }), contributionScans };
}

function appealPlan(deps: CoreDeps): AppealPlan {
  const client = deps.getReadClient(1);
  if (client === undefined) throw new Error("the test deps have no read client for chain 1");
  const decision: AppealDecisionEvent = { blockNumber: DECISION_BLOCK, appealedAt: 1_700_000_000 };
  return {
    context: { client, binding: BINDING, family: testFamily(), localId: { kind: "local-id", value: LOCAL_ID }, override: undefined },
    decisions: sectionReady([decision]),
    disputeStartBlock: DISPUTE_START,
  };
}

function renderAppealReads(deps: CoreDeps) {
  const plan = sectionReady(appealPlan(deps));
  return renderHook(() => useAppealReads(plan, 3, undefined), {
    wrapper: ({ children }: { readonly children?: ReactNode }) => <TestDataProvider deps={deps}>{children}</TestDataProvider>,
  });
}

const FOUND_FUNDING = { status: "ready", value: { round: 1n, contributions: [{ ruling: 2n, amount: AMOUNT }], fundedRulings: [] } };

describe("useAppealReads with the real funding scan", () => {
  it("the funding of a round counts a contribution made 40,000 blocks after its appeal decision", async () => {
    const { deps, contributionScans } = fundingChain();
    const { result } = renderAppealReads(deps);
    await waitFor(() => {
      expect(result.current.funding).toEqual(FOUND_FUNDING);
    });
    expect(contributionScans).toEqual([{ from: DECISION_BLOCK, to: HEAD }]);
  });

  it("through an RPC that refuses ranges over 10,000 blocks the scan is split and still finds that contribution", async () => {
    const { deps, contributionScans } = fundingChain({ maxRange: 10_000n });
    const { result } = renderAppealReads(deps);
    await waitFor(() => {
      expect(result.current.funding).toEqual(FOUND_FUNDING);
    });
    const [refused, ...windows] = contributionScans;
    expect(refused).toEqual({ from: DECISION_BLOCK, to: HEAD });
    expect(windows.every(({ from, to }) => to - from + 1n <= 10_000n)).toBe(true);
    expect(windows[0]?.from).toBe(DECISION_BLOCK);
    expect(windows.at(-1)?.to).toBe(HEAD);
    expect(windows.slice(1).every((window, index) => window.from === (windows[index]?.to ?? 0n) + 1n)).toBe(true);
  });
});
