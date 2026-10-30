import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import type { Hex } from "../types";
import { chainOf } from "../test/chains/testHelpers";
import { buildCreateDisputeCall } from "./index";
import { decodedArgs, EVIDENCE_CID, expectCall, selectorOf } from "../test/writes/testHelpers";

const EXTRA_DATA: Hex = `0x${"0".repeat(63)}1${"0".repeat(63)}3`;
const META_EVIDENCE = `/ipfs/${EVIDENCE_CID}/metaEvidence.json`;

describe("buildCreateDisputeCall", () => {
  it("createDispute(extraData, metaEvidenceURI, numberOfRulingOptions) on the chain's ArbitrableProxy, paying the arbitration cost", () => {
    const mainnet = chainOf(1);
    const call = expectCall(buildCreateDisputeCall({ chain: mainnet, extraData: EXTRA_DATA, metaEvidenceUri: META_EVIDENCE, numberOfRulingOptions: 3n, cost: 123_456n }));
    expect(call).toMatchObject({ kind: "create-dispute", chainId: 1, address: mainnet.arbitrableProxy, functionName: "createDispute", value: 123_456n });
    expect(selectorOf(call)).toBe(toFunctionSelector("createDispute(bytes,string,uint256)"));
    expect(decodedArgs(call)).toEqual([EXTRA_DATA, META_EVIDENCE, 3n]);
  });

  it.each<[string, number, bigint]>([
    ["zero ruling options (uint and datetime, the contract maximum) are sent as 0", 11155111, 0n],
    ["2^n ruling options of a 32-option multiple-select fit the uint256 argument", 1, 2n ** 32n],
  ])("%s", (_name, chainId, numberOfRulingOptions) => {
    const chain = chainOf(chainId);
    const call = expectCall(buildCreateDisputeCall({ chain, extraData: EXTRA_DATA, metaEvidenceUri: META_EVIDENCE, numberOfRulingOptions, cost: 1n }));
    expect(call).toMatchObject({ chainId, address: chain.arbitrableProxy });
    expect(decodedArgs(call)[2]).toBe(numberOfRulingOptions);
  });

  it("a chain without an ArbitrableProxy cannot create disputes", () => {
    expect(buildCreateDisputeCall({ chain: chainOf(137), extraData: EXTRA_DATA, metaEvidenceUri: META_EVIDENCE, numberOfRulingOptions: 2n, cost: 1n })).toEqual({
      ok: false,
      refusal: "no-arbitrable-proxy",
    });
  });

  it("an upload result that is not content-addressed never goes on-chain", () => {
    for (const metaEvidenceUri of [
      "",
      "https://evil.example/metaEvidence.json",
      `/ipfs/${EVIDENCE_CID}/../../ipns/x`,
      "/ipns/example.eth/metaEvidence.json",
      "/ipfs/not-a-cid/metaEvidence.json",
    ]) {
      expect(buildCreateDisputeCall({ chain: chainOf(1), extraData: EXTRA_DATA, metaEvidenceUri, numberOfRulingOptions: 2n, cost: 1n })).toEqual({
        ok: false,
        refusal: "not-content-addressed",
      });
    }
  });

  it("an accepted upload result is written in its canonical form", () => {
    const call = expectCall(
      buildCreateDisputeCall({ chain: chainOf(1), extraData: EXTRA_DATA, metaEvidenceUri: `ipfs://${EVIDENCE_CID}/metaEvidence.json`, numberOfRulingOptions: 2n, cost: 1n }),
    );
    expect(decodedArgs(call)[1]).toBe(META_EVIDENCE);
  });

  it("a negative ruling option count is not an encodable uint256 and is refused", () => {
    expect(buildCreateDisputeCall({ chain: chainOf(1), extraData: EXTRA_DATA, metaEvidenceUri: META_EVIDENCE, numberOfRulingOptions: -1n, cost: 1n })).toEqual({
      ok: false,
      refusal: "ruling-out-of-range",
    });
  });
});
