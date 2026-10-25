import type { RealityProxyEntry } from "../../registry/types";
import type { Address, Hex } from "../../types";
import { createdLog, fakeNetwork, mappingLog, questionLog, templateLog, type FakeChain } from "./testHelpers";
import type { KnownDisputeQuestion } from "../../reality/types";

/** The fake world of the lookup tests: a single-chain proxy and two cross-chain proxies on chain 1, Reality.eth on chains 1 and 100. */
export const SINGLE = "0x1111111111111111111111111111111111111111" as Address;
const CROSS = "0x2222222222222222222222222222222222222222" as Address;
export const CROSS_WITH_BLOCK = "0x3333333333333333333333333333333333333333" as Address;
export const REALITY_1 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
export const REALITY_100 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;

export const Q_KNOWN_SINGLE: Hex = `0x${"01".repeat(32)}`;
export const Q_KNOWN_CROSS: Hex = `0x${"02".repeat(32)}`;
export const Q_NEW_SINGLE: Hex = `0x${"03".repeat(32)}`;
export const Q_NEW_CROSS: Hex = `0x${"04".repeat(32)}`;

const JUSTIFICATION = "Test proxy.";

export const SINGLE_ENTRY: RealityProxyEntry = {
  proxy: SINGLE,
  kind: "single-chain",
  realityChainId: 1,
  reality: REALITY_1,
  proxyDeployBlock: 1000,
  realityDeployBlock: 100,
  hasArbitrationCreatedBlock: false,
  answeredTooSoon: true,
  localizedLang: null,
  questionOverride: null,
  justification: JUSTIFICATION,
};

export const CROSS_ENTRY: RealityProxyEntry = {
  ...SINGLE_ENTRY,
  proxy: CROSS,
  kind: "cross-chain",
  realityChainId: 100,
  reality: REALITY_100,
};

export const CROSS_WITH_BLOCK_ENTRY: RealityProxyEntry = { ...CROSS_ENTRY, proxy: CROSS_WITH_BLOCK, hasArbitrationCreatedBlock: true };

/** The known-questions map the lookup tests run against, with a snapshot at block 500,000 of chain 1. */
export const MOCK_REGISTRY_SNAPSHOT_BLOCKS: Record<number, number> = { 1: 500_000 };
export const MOCK_KNOWN_DISPUTE_QUESTIONS: Record<string, KnownDisputeQuestion> = {
  [`1:${SINGLE}:7`]: { questionId: Q_KNOWN_SINGLE, questionBlock: 400_000, templateId: 2 },
  [`1:${CROSS}:8`]: { questionId: Q_KNOWN_CROSS, questionBlock: 700_000, templateId: 3 },
};

/** The cache key of dispute 7 of the single-chain proxy. */
export const KEY_7 = `@@kleros/court/reality-question/v1/1/${SINGLE}/7`;

/** Chain 1 has 12 s blocks, chain 100 has 5 s blocks. */
const BLOCK_TIMES = { 1: 12, 100: 5 };

/**
 * Dispute 10 is created at block 860,000 of chain 1: its question lies at or before the first chain 100 block one hour
 * (clock skew margin) after it, that is block ceil((12 s * 860,000 + 3,600 s) / 5 s).
 */
export const CROSS_BOUND = (12n * 860_000n + 3600n + 4n) / 5n;

function fakeChains(): Record<1 | 100, FakeChain> {
  return {
    1: {
      latest: 900_000n,
      maxRange: BigInt(Number.MAX_SAFE_INTEGER),
      blockTimeS: BLOCK_TIMES[1],
      logs: [
        questionLog(REALITY_1, 400_000, Q_KNOWN_SINGLE, 2, "known single"),
        templateLog(REALITY_1, 100, 2, "template 2 on 1"),
        mappingLog(SINGLE, 850_000, 9, Q_NEW_SINGLE),
        questionLog(REALITY_1, 849_990, Q_NEW_SINGLE, 2, "new single"),
        createdLog(CROSS, 860_000, 10, Q_NEW_CROSS),
        createdLog(CROSS_WITH_BLOCK, 870_000, 11, Q_NEW_CROSS),
      ],
      templates: { 2: 100n },
      hintProxy: CROSS_WITH_BLOCK,
      createdBlocks: { 11: 870_000n },
    },
    100: {
      latest: 3_000_000n,
      maxRange: BigInt(Number.MAX_SAFE_INTEGER),
      blockTimeS: BLOCK_TIMES[100],
      logs: [
        questionLog(REALITY_100, 700_000, Q_KNOWN_CROSS, 3, "known cross"),
        questionLog(REALITY_100, 1_990_000, Q_NEW_CROSS, 3, "new cross"),
        templateLog(REALITY_100, 150, 3, "template 3 on 100"),
      ],
      templates: { 3: 150n },
      createdBlocks: {},
    },
  };
}

/** A fresh world: the fake chains and the clients reading them. */
export function createWorld() {
  const chains = fakeChains();
  return { chains, ...fakeNetwork(chains) };
}
