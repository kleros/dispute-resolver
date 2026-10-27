import { numberToHex, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import type { RegistryKey } from "../types";
import { DISPUTE_ID_TO_QUESTION_ID } from "./events";
import { generateKnownQuestions, renderKnownQuestionsModule, type KnownQuestionsData } from "./generator";
import { createdLog, fakeNetwork, filterOf, mappingLog, nth, questionLog, templateLog, type FakeChain, type NodeCall } from "../test/reality/testHelpers";
import { CROSS_ENTRY, Q_KNOWN_CROSS, Q_KNOWN_SINGLE, Q_NEW_CROSS, Q_NEW_SINGLE, REALITY_1, REALITY_100, SINGLE, SINGLE_ENTRY } from "../test/reality/testWorld";

const PROXIES: Record<RegistryKey, typeof SINGLE_ENTRY> = {
  [`1:${SINGLE}`]: SINGLE_ENTRY,
  [`1:${CROSS_ENTRY.proxy}`]: CROSS_ENTRY,
};

const Q_NEWEST: `0x${string}` = `0x${"06".repeat(32)}`;
const MAP_TOPIC = toEventSelector(DISPUTE_ID_TO_QUESTION_ID);

function chains(): Record<1 | 100, FakeChain> {
  const base = { maxRange: BigInt(Number.MAX_SAFE_INTEGER), createdBlocks: {}, templates: {} };
  return {
    1: {
      ...base,
      latest: 900_000n,
      finalized: 800_000n,
      blockTimeS: 12,
      logs: [
        mappingLog(SINGLE, 2000, 1, Q_KNOWN_SINGLE),
        questionLog(REALITY_1, 1990, Q_KNOWN_SINGLE, 2, "dispute 1"),
        mappingLog(SINGLE, 750_000, 2, Q_NEW_SINGLE),
        questionLog(REALITY_1, 749_990, Q_NEW_SINGLE, 2, "dispute 2"),
        mappingLog(SINGLE, 850_000, 3, Q_NEWEST),
        questionLog(REALITY_1, 849_990, Q_NEWEST, 2, "dispute 3, after the finalized block"),
        createdLog(CROSS_ENTRY.proxy, 600_000, 5, Q_KNOWN_CROSS),
        templateLog(REALITY_1, 100, 2, "template"),
      ],
    },
    100: {
      ...base,
      latest: 3_000_000n,
      finalized: 2_900_000n,
      blockTimeS: 5,
      logs: [questionLog(REALITY_100, 1_000_000, Q_KNOWN_CROSS, 3, "dispute 5")],
    },
  };
}

const PREVIOUS: KnownQuestionsData = {
  snapshotBlocks: { 1: 500_000 },
  questions: { [`1:${SINGLE}:1`]: { questionId: Q_KNOWN_SINGLE, questionBlock: 1990, templateId: 2 } },
};

const EXPECTED_QUESTIONS = {
  [`1:${SINGLE}:1`]: { questionId: Q_KNOWN_SINGLE, questionBlock: 1990, templateId: 2 },
  [`1:${SINGLE}:2`]: { questionId: Q_NEW_SINGLE, questionBlock: 749_990, templateId: 2 },
  [`1:${CROSS_ENTRY.proxy}:5`]: { questionId: Q_KNOWN_CROSS, questionBlock: 1_000_000, templateId: 3 },
};

function run(overrides: Partial<Parameters<typeof generateKnownQuestions>[0]> = {}, nodes = chains()) {
  const network = fakeNetwork(nodes);
  const result = generateKnownQuestions({ proxies: PROXIES, previous: PREVIOUS, mode: "incremental", clients: network.clients, ...overrides });
  return { result, ...network };
}

function mappingScans(calls: readonly NodeCall[], address: string): NodeCall[] {
  return calls.filter((call) => call.method === "eth_getLogs" && filterOf(call).address === address && filterOf(call).topics[0] === MAP_TOPIC);
}

describe("generateKnownQuestions", () => {
  it("re-verifies known disputes and scans proxies only after the previous snapshot in incremental mode", async () => {
    const { result, calls } = run();
    const data = await result;
    expect(data.snapshotBlocks).toEqual({ 1: 800_000 });
    expect(data.questions).toEqual(EXPECTED_QUESTIONS);

    expect(filterOf(nth(mappingScans(calls, SINGLE), 0))).toMatchObject({ fromBlock: numberToHex(500_001), toBlock: numberToHex(800_000) });
    expect(
      filterOf(
        nth(
          calls.filter((call) => call.method === "eth_getLogs" && filterOf(call).address === CROSS_ENTRY.proxy),
          0,
        ),
      ),
    ).toMatchObject({
      fromBlock: numberToHex(1000),
      toBlock: numberToHex(800_000),
    });
    expect(calls.some((call) => call.method === "eth_getLogs" && filterOf(call).fromBlock === numberToHex(1990) && filterOf(call).toBlock === numberToHex(1990))).toBe(true);
  });

  it("rescans every proxy from its deployment block in full mode", async () => {
    const { result, calls } = run({ mode: "full" });
    const data = await result;
    expect(data.questions).toEqual(EXPECTED_QUESTIONS);
    expect(filterOf(nth(mappingScans(calls, SINGLE), 0))).toMatchObject({ fromBlock: numberToHex(1000), toBlock: numberToHex(800_000) });
  });

  it("scans through a provider that caps eth_getLogs ranges in full mode", async () => {
    const nodes = chains();
    nodes[1].maxRange = 10_000n;
    nodes[100].maxRange = 10_000n;
    const data = await run({ mode: "full" }, nodes).result;
    expect(data.questions).toEqual(EXPECTED_QUESTIONS);
  });

  it("reproduces the committed data at its own snapshot blocks in check mode", async () => {
    const committed: KnownQuestionsData = { snapshotBlocks: { 1: 800_000 }, questions: EXPECTED_QUESTIONS };
    const { result, calls } = run({ mode: "check", previous: committed });
    const data = await result;
    expect(renderKnownQuestionsModule(data)).toBe(renderKnownQuestionsModule(committed));
    expect(filterOf(nth(mappingScans(calls, SINGLE), 0))).toMatchObject({ fromBlock: numberToHex(1000), toBlock: numberToHex(800_000) });
    expect(calls.filter((call) => call.chainId === 1 && call.method === "eth_getBlockByNumber")).toHaveLength(0);
  });

  it("fails the check when a committed question is not on the chain", async () => {
    const committed: KnownQuestionsData = {
      snapshotBlocks: { 1: 800_000 },
      questions: { ...EXPECTED_QUESTIONS, [`1:${SINGLE}:2`]: { questionId: Q_NEW_SINGLE, questionBlock: 749_991, templateId: 2 } },
    };
    await expect(run({ mode: "check", previous: committed }).result).rejects.toThrow(`1:${SINGLE}: LogNewQuestion of ${Q_NEW_SINGLE} not at 749991`);
  });

  it("rejects a known question whose template changed", async () => {
    const previous: KnownQuestionsData = { ...PREVIOUS, questions: { [`1:${SINGLE}:1`]: { questionId: Q_KNOWN_SINGLE, questionBlock: 1990, templateId: 5 } } };
    await expect(run({ previous }).result).rejects.toThrow(`1:${SINGLE}: template of ${Q_KNOWN_SINGLE} changed`);
  });

  it("rejects a known dispute that the scan finds again", async () => {
    const nodes = chains();
    nodes[1].logs.push(mappingLog(SINGLE, 600_000, 1, Q_KNOWN_SINGLE));
    await expect(run({}, nodes).result).rejects.toThrow(`1:${SINGLE}: dispute 1 mapped twice`);
  });

  it("rejects a dispute the proxy mapped twice", async () => {
    const nodes = chains();
    nodes[1].logs.push(mappingLog(SINGLE, 760_000, 2, Q_NEWEST));
    await expect(run({}, nodes).result).rejects.toThrow(`1:${SINGLE}: dispute 2 mapped twice`);
  });

  it("rejects a question that is not found exactly once", async () => {
    const nodes = chains();
    nodes[1].logs = nodes[1].logs.filter((log) => log.blockNumber !== numberToHex(749_990));
    await expect(run({}, nodes).result).rejects.toThrow(`Expected exactly one LogNewQuestion for ${Q_NEW_SINGLE} (1:${SINGLE}) log, found 0.`);
  });

  it("requires the snapshot block of every arbitrator chain in check mode", async () => {
    await expect(run({ mode: "check", previous: { snapshotBlocks: {}, questions: {} } }).result).rejects.toThrow("No snapshot block for chain 1");
  });

  it("rejects when a registry chain has no read client", async () => {
    const network = fakeNetwork(chains());
    await expect(
      generateKnownQuestions({ proxies: PROXIES, previous: PREVIOUS, mode: "incremental", clients: (chainId) => (chainId === 1 ? network.clients(1) : undefined) }),
    ).rejects.toThrow("reads on chain 100 are unavailable");
  });

  it("reports each proxy's progress", async () => {
    const lines: string[] = [];
    await run({ onProgress: (line) => lines.push(line) }).result;
    expect(lines).toEqual([`1:${SINGLE}: 2 dispute(s)`, `1:${CROSS_ENTRY.proxy}: 1 dispute(s)`]);
  });
});

describe("renderKnownQuestionsModule", () => {
  const question = (block: number) => ({ questionId: Q_NEW_CROSS, questionBlock: block, templateId: 0 });

  it("sorts by chain, then proxy, then dispute ID numerically", () => {
    const source = renderKnownQuestionsModule({
      snapshotBlocks: { 100: 7, 1: 5 },
      questions: {
        [`100:${SINGLE}:1`]: question(1),
        [`1:${SINGLE}:10`]: question(2),
        [`1:${SINGLE}:9`]: question(3),
        [`1:${CROSS_ENTRY.proxy}:2`]: question(4),
      },
    });
    expect(source).toContain("{ 1: 5, 100: 7 }");
    const keys = [...source.matchAll(/^ {2}"([^"]+)": \{$/gm)].map((match) => match[1]);
    expect(keys).toEqual([`1:${SINGLE}:9`, `1:${SINGLE}:10`, `1:${CROSS_ENTRY.proxy}:2`, `100:${SINGLE}:1`]);
  });
});
