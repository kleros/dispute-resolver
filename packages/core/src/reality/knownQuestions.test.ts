import { describe, expect, it } from "vitest";
import { REGISTRY } from "../registry";
import type { RegistryKey } from "../types";
import generatedSource from "./knownQuestions.generated.ts?raw";
import { renderKnownQuestionsModule } from "./generator";
import { KNOWN_DISPUTE_QUESTIONS, REGISTRY_SNAPSHOT_BLOCKS } from "./knownQuestions.generated";

const entries = Object.entries(KNOWN_DISPUTE_QUESTIONS);

describe("the known-questions map", () => {
  it("snapshots mainnet and Gnosis past blocks 26162181 and 48685374", () => {
    expect(Object.keys(REGISTRY_SNAPSHOT_BLOCKS)).toEqual(["1", "100"]);
    expect(REGISTRY_SNAPSHOT_BLOCKS[1]).toBeGreaterThanOrEqual(26_162_181);
    expect(REGISTRY_SNAPSHOT_BLOCKS[100]).toBeGreaterThanOrEqual(48_685_374);
    expect(REGISTRY_SNAPSHOT_BLOCKS).not.toEqual({ 1: 26_162_181, 100: 48_685_374 });
  });

  it("maps mainnet dispute 1680 to the crafted question 0x7eea… of template 20", () => {
    expect(KNOWN_DISPUTE_QUESTIONS["1:0xf72cfd1b34a91a64f9a98537fe63fbab7530adca:1680"]).toEqual({
      questionId: "0x7eea8e9e34d09c2964393878714198552f7b41381407e8bfee7312199e748844",
      questionBlock: 26_086_996,
      templateId: 20,
    });
  });

  it("keeps at least 44 questions, since the map only ever grows", () => {
    expect(entries.length).toBeGreaterThanOrEqual(44);
  });

  it("keys every question by a registered proxy of a chain with a snapshot block", () => {
    for (const [key] of entries) {
      const [chainId = "", proxy = "", disputeId = ""] = key.split(":");
      expect(REGISTRY.realityProxies, key).toHaveProperty(`${chainId}:${proxy}`);
      expect(REGISTRY_SNAPSHOT_BLOCKS, key).toHaveProperty(chainId);
      expect(disputeId, key).toMatch(/^\d+$/);
    }
  });

  it("has a snapshot block for the arbitrator chain of every registered proxy", () => {
    const chains = new Set(Object.keys(REGISTRY.realityProxies).map((key) => key.slice(0, key.indexOf(":"))));
    expect([...chains].sort((a, b) => Number(a) - Number(b))).toEqual(Object.keys(REGISTRY_SNAPSHOT_BLOCKS));
  });

  it("holds well-formed questions, single-chain ones created before their chain's snapshot block", () => {
    for (const [key, question] of entries) {
      const registryKey = key.slice(0, key.lastIndexOf(":")) as RegistryKey;
      const chainId = Number(key.slice(0, key.indexOf(":")));
      expect(question.questionId, key).toMatch(/^0x[0-9a-f]{64}$/);
      expect(Number.isInteger(question.questionBlock) && question.questionBlock > 0, key).toBe(true);
      expect(Number.isInteger(question.templateId) && question.templateId >= 0, key).toBe(true);
      if (REGISTRY.realityProxies[registryKey]?.realityChainId === chainId) expect(question.questionBlock, key).toBeLessThanOrEqual(REGISTRY_SNAPSHOT_BLOCKS[chainId] ?? 0);
    }
  });

  it("is committed exactly as the generator renders its own data", () => {
    expect(renderKnownQuestionsModule({ snapshotBlocks: REGISTRY_SNAPSHOT_BLOCKS, questions: KNOWN_DISPUTE_QUESTIONS })).toBe(generatedSource);
  });
});
