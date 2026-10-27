import { describe, expect, it } from "vitest";
import { klerosLiquidAbi } from "../abi";
import type { Address } from "../types";
import { listOngoingDisputes } from ".";
import type { Court } from "./types";
import { answer, disputeCreationLog, fakeClient, failure, newPeriodLog, rpcError } from "../test/disputes/testHelpers";
import type { CallAnswer, FakeNode } from "../test/disputes/testHelpers";

/** Sepolia's arbitrator: a 50,000-block lookback from its deployment block 3,635,742. */
const ARBITRATOR: Address = "0x90992fb4e15ce0c59aeffb376460fda4ee19c879";
const ARBITRABLE: Address = "0x009ca5a0b816156f91b29a93d7688c52480bab24";
const HEAD = 11_000_000n;
const LOOKBACK_START = HEAD - 50_000n;

const COURTS: readonly Court[] = [
  { id: 0n, parent: 0n, hiddenVotes: false, timesPerPeriod: [100n, 200n, 300n, 400n], policyUri: null, name: "General Court" },
  { id: 1n, parent: 0n, hiddenVotes: true, timesPerPeriod: [10n, 20n, 30n, 40n], policyUri: null, name: null },
];

function struct(id: bigint, input: { subcourt: bigint; period: number; lastPeriodChange: bigint }): [string, CallAnswer] {
  return answer({
    to: ARBITRATOR,
    abi: klerosLiquidAbi,
    functionName: "disputes",
    args: [id],
    result: [input.subcourt, ARBITRABLE, 2n, input.period, input.lastPeriodChange, 0n, 0n, input.period === 4],
  });
}

function node(overrides: Partial<FakeNode> = {}): FakeNode {
  return {
    head: HEAD,
    calls: new Map([
      struct(10n, { subcourt: 0n, period: 0, lastPeriodChange: 1000n }),
      struct(11n, { subcourt: 1n, period: 1, lastPeriodChange: 2000n }),
      struct(12n, { subcourt: 0n, period: 3, lastPeriodChange: 3000n }),
      struct(13n, { subcourt: 7n, period: 2, lastPeriodChange: 4000n }),
    ]),
    logs: [
      disputeCreationLog(ARBITRATOR, 10n, ARBITRABLE, LOOKBACK_START + 10n),
      disputeCreationLog(ARBITRATOR, 11n, ARBITRABLE, LOOKBACK_START + 11n),
      disputeCreationLog(ARBITRATOR, 12n, ARBITRABLE, LOOKBACK_START + 12n),
      disputeCreationLog(ARBITRATOR, 13n, ARBITRABLE, LOOKBACK_START + 13n),
      disputeCreationLog(ARBITRATOR, 14n, ARBITRABLE, LOOKBACK_START + 14n),
      newPeriodLog(ARBITRATOR, 11n, 1, LOOKBACK_START + 20n),
      newPeriodLog(ARBITRATOR, 12n, 2, LOOKBACK_START + 21n),
      newPeriodLog(ARBITRATOR, 12n, 3, LOOKBACK_START + 22n),
      newPeriodLog(ARBITRATOR, 14n, 2, LOOKBACK_START + 23n),
      newPeriodLog(ARBITRATOR, 14n, 4, LOOKBACK_START + 24n),
      disputeCreationLog(ARBITRATOR, 9n, ARBITRABLE, LOOKBACK_START - 1n),
    ],
    ...overrides,
  };
}

describe("listOngoingDisputes", () => {
  it("open IDs are the created IDs minus those that reached execution, newest first", async () => {
    const { client } = fakeClient(node());
    const list = await listOngoingDisputes({ chainId: 11155111, client }, COURTS);
    if (list.status !== "ok") throw new Error(list.status);
    expect(list.disputes.map((dispute) => dispute.id)).toEqual([13n, 12n, 11n, 10n]);
    expect(list.failedIds).toEqual([]);
  });

  it("scans DisputeCreation and NewPeriod over [ongoingScanStart, head] on the arbitrator", async () => {
    const { client, requests } = fakeClient(node());
    await listOngoingDisputes({ chainId: 11155111, client }, COURTS);
    expect(requests.logs).toHaveLength(2);
    for (const request of requests.logs) expect(request).toMatchObject({ address: ARBITRATOR, fromBlock: LOOKBACK_START, toBlock: HEAD });
  });

  it("each card carries the dispute struct and a countdown target from the court's timesPerPeriod, null instead of crashing when the court is missing from the list", async () => {
    const { client } = fakeClient(node());
    const list = await listOngoingDisputes({ chainId: 11155111, client }, COURTS);
    if (list.status !== "ok") throw new Error(list.status);
    expect(list.disputes.find((dispute) => dispute.id === 12n)).toEqual({
      id: 12n,
      arbitrated: ARBITRABLE,
      period: 3,
      subcourtId: 0n,
      lastPeriodChange: 3000,
      countdownTarget: 3400,
    });
    expect(list.disputes.find((dispute) => dispute.id === 11n)?.countdownTarget).toBe(2020);
    expect(list.disputes.find((dispute) => dispute.id === 13n)?.countdownTarget).toBeNull();
  });

  it("without courts every countdown is null and the list still loads", async () => {
    const { client } = fakeClient(node());
    const list = await listOngoingDisputes({ chainId: 11155111, client }, null);
    if (list.status !== "ok") throw new Error(list.status);
    expect(list.disputes.every((dispute) => dispute.countdownTarget === null)).toBe(true);
  });

  it("a dispute whose struct read fails is kept in failedIds, not dropped silently", async () => {
    const calls = new Map(node().calls);
    const [key, broken] = failure({ to: ARBITRATOR, abi: klerosLiquidAbi, functionName: "disputes", args: [11n], error: { code: -32000, message: "header not found" } });
    calls.set(key, broken);
    const { client } = fakeClient(node({ calls }));
    const list = await listOngoingDisputes({ chainId: 11155111, client }, COURTS);
    if (list.status !== "ok") throw new Error(list.status);
    expect(list.disputes.map((dispute) => dispute.id)).toEqual([13n, 12n, 10n]);
    expect(list.failedIds).toEqual([11n]);
  });

  it("a struct with no arbitrated contract is a failed ID, not a card", async () => {
    const calls = new Map(node().calls);
    const [key, zero] = answer({
      to: ARBITRATOR,
      abi: klerosLiquidAbi,
      functionName: "disputes",
      args: [10n],
      result: [0n, "0x0000000000000000000000000000000000000000", 0n, 0, 0n, 0n, 0n, false],
    });
    calls.set(key, zero);
    const { client } = fakeClient(node({ calls }));
    const list = await listOngoingDisputes({ chainId: 11155111, client }, COURTS);
    if (list.status !== "ok") throw new Error(list.status);
    expect(list.failedIds).toEqual([10n]);
  });

  it("a failing log scan fails the list", async () => {
    const { client } = fakeClient(node({ failing: { eth_getLogs: rpcError(-32000, "header not found") } }));
    expect(await listOngoingDisputes({ chainId: 11155111, client }, COURTS)).toMatchObject({ status: "failed", error: { code: "rpc-error" } });
  });

  it("a chain without an arbitrator is no-arbitrator, without any read", async () => {
    const { client, requests } = fakeClient(node());
    expect(await listOngoingDisputes({ chainId: 8453, client }, COURTS)).toEqual({ status: "no-arbitrator" });
    expect(requests.methods).toEqual([]);
  });

  it("without a read RPC the list fails with no-rpc", async () => {
    const list = await listOngoingDisputes({ chainId: 11155111, client: undefined }, COURTS);
    expect(list).toMatchObject({ status: "failed", error: { code: "no-rpc", message: "This network's data is unavailable." } });
    if (list.status === "failed") expect(list.error.message).not.toMatch(/configur|RPC|REACT_APP/i);
  });

  it("no open dispute is an empty list", async () => {
    const { client } = fakeClient(node({ logs: [] }));
    expect(await listOngoingDisputes({ chainId: 11155111, client }, COURTS)).toEqual({ status: "ok", disputes: [], failedIds: [] });
  });

  it("an ID created twice in the window is listed once", async () => {
    const base = node();
    const { client } = fakeClient(node({ logs: [...(base.logs ?? []), disputeCreationLog(ARBITRATOR, 10n, ARBITRABLE, LOOKBACK_START + 30n, 1)] }));
    const list = await listOngoingDisputes({ chainId: 11155111, client }, COURTS);
    if (list.status !== "ok") throw new Error(list.status);
    expect(list.disputes.filter((dispute) => dispute.id === 10n)).toHaveLength(1);
  });
});
