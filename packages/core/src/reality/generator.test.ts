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

/** Chain 1 is final up to block 800,000 and has reached 900,000; chain 100 is final up to 2,900,000. */
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
  it("A6: an incremental update re-verifies the known disputes and scans the proxies only after the previous snapshot", async () => {
    const { result, calls } = run();
    const data = await result;
    expect(data.snapshotBlocks).toEqual({ 1: 800_000 });
    expect(data.questions).toEqual(EXPECTED_QUESTIONS);

    // The proxy with known disputes is scanned from the previous snapshot, the one without from its deployment block.
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
    // The known dispute is re-verified with a single-block query at its recorded block.
    expect(calls.some((call) => call.method === "eth_getLogs" && filterOf(call).fromBlock === numberToHex(1990) && filterOf(call).toBlock === numberToHex(1990))).toBe(true);
  });

  it("A6: a full update rescans every proxy from its deployment block", async () => {
    const { result, calls } = run({ mode: "full" });
    const data = await result;
    expect(data.questions).toEqual(EXPECTED_QUESTIONS);
    expect(filterOf(nth(mappingScans(calls, SINGLE), 0))).toMatchObject({ fromBlock: numberToHex(1000), toBlock: numberToHex(800_000) });
  });

  it("A6: a full update scans through a provider that caps eth_getLogs ranges", async () => {
    const nodes = chains();
    nodes[1].maxRange = 10_000n;
    nodes[100].maxRange = 10_000n;
    const data = await run({ mode: "full" }, nodes).result;
    expect(data.questions).toEqual(EXPECTED_QUESTIONS);
  });

  it("A6: the check recomputes the committed data at its own snapshot blocks and reproduces it", async () => {
    const committed: KnownQuestionsData = { snapshotBlocks: { 1: 800_000 }, questions: EXPECTED_QUESTIONS };
    const { result, calls } = run({ mode: "check", previous: committed });
    const data = await result;
    expect(renderKnownQuestionsModule(data)).toBe(renderKnownQuestionsModule(committed));
    expect(filterOf(nth(mappingScans(calls, SINGLE), 0))).toMatchObject({ fromBlock: numberToHex(1000), toBlock: numberToHex(800_000) });
    expect(calls.filter((call) => call.chainId === 1 && call.method === "eth_getBlockByNumber")).toHaveLength(0);
  });

  it("A6: the check notices a committed question that is not on the chain", async () => {
    const committed: KnownQuestionsData = {
      snapshotBlocks: { 1: 800_000 },
      questions: { ...EXPECTED_QUESTIONS, [`1:${SINGLE}:2`]: { questionId: Q_NEW_SINGLE, questionBlock: 749_991, templateId: 2 } },
    };
    await expect(run({ mode: "check", previous: committed }).result).rejects.toThrow(`1:${SINGLE}: LogNewQuestion of ${Q_NEW_SINGLE} not at 749991`);
  });

  it("A6: a known question whose template changed is an error to investigate", async () => {
    const previous: KnownQuestionsData = { ...PREVIOUS, questions: { [`1:${SINGLE}:1`]: { questionId: Q_KNOWN_SINGLE, questionBlock: 1990, templateId: 5 } } };
    await expect(run({ previous }).result).rejects.toThrow(`1:${SINGLE}: template of ${Q_KNOWN_SINGLE} changed`);
  });

  it("A6: a known dispute that the scan finds again is an error", async () => {
    const nodes = chains();
    nodes[1].logs.push(mappingLog(SINGLE, 600_000, 1, Q_KNOWN_SINGLE));
    await expect(run({}, nodes).result).rejects.toThrow(`1:${SINGLE}: dispute 1 mapped twice`);
  });

  it("A6: a dispute mapped twice by the proxy is an error", async () => {
    const nodes = chains();
    nodes[1].logs.push(mappingLog(SINGLE, 760_000, 2, Q_NEWEST));
    await expect(run({}, nodes).result).rejects.toThrow(`1:${SINGLE}: dispute 2 mapped twice`);
  });

  it("A6: a question that cannot be found exactly once is an error", async () => {
    const nodes = chains();
    nodes[1].logs = nodes[1].logs.filter((log) => log.blockNumber !== numberToHex(749_990));
    await expect(run({}, nodes).result).rejects.toThrow(`Expected exactly one LogNewQuestion for ${Q_NEW_SINGLE} (1:${SINGLE}) log, found 0.`);
  });

  it("A6: the check needs the snapshot block of every arbitrator chain", async () => {
    await expect(run({ mode: "check", previous: { snapshotBlocks: {}, questions: {} } }).result).rejects.toThrow("No snapshot block for chain 1");
  });

  it("D-56: rejects when a chain of the registry has no RPC configured", async () => {
    const network = fakeNetwork(chains());
    await expect(
      generateKnownQuestions({ proxies: PROXIES, previous: PREVIOUS, mode: "incremental", clients: (chainId) => (chainId === 1 ? network.clients(1) : undefined) }),
    ).rejects.toThrow("no RPC configured for chain 100");
  });

  it("A6: reports each proxy's progress", async () => {
    const lines: string[] = [];
    await run({ onProgress: (line) => lines.push(line) }).result;
    expect(lines).toEqual([`1:${SINGLE}: 2 dispute(s)`, `1:${CROSS_ENTRY.proxy}: 1 dispute(s)`]);
  });
});

describe("renderKnownQuestionsModule", () => {
  const question = (block: number) => ({ questionId: Q_NEW_CROSS, questionBlock: block, templateId: 0 });

  it("A6: sorts by chain, then proxy, then dispute ID numerically", () => {
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

  it("A6: writes one expanded object per dispute, the layout prettier keeps", () => {
    const source = renderKnownQuestionsModule({ snapshotBlocks: { 1: 5 }, questions: { [`1:${SINGLE}:9`]: question(3) } });
    expect(source).toContain(`  "1:${SINGLE}:9": {\n    questionId: "${Q_NEW_CROSS}",\n    questionBlock: 3,\n    templateId: 0,\n  },\n};\n`);
  });
});
