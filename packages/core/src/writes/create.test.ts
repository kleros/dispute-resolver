import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { getChain } from "../chains";
import type { ChainConfig } from "../chains/types";
import type { Hex } from "../types";
import { buildCreateDisputeCall } from "./index";
import { decodedArgs, EVIDENCE_CID, expectCall, selectorOf } from "./testHelpers";

function chain(chainId: number): ChainConfig {
  const config = getChain(chainId);
  if (config === undefined) throw new Error(`chain ${String(chainId)} is not configured`);
  return config;
}

const EXTRA_DATA: Hex = `0x${"0".repeat(63)}1${"0".repeat(63)}3`;
const META_EVIDENCE = `/ipfs/${EVIDENCE_CID}/metaEvidence.json`;

describe("buildCreateDisputeCall", () => {
  it("§6.2: createDispute(extraData, metaEvidenceURI, numberOfRulingOptions) on the chain's ArbitrableProxy, paying the arbitration cost", () => {
    const mainnet = chain(1);
    const call = expectCall(buildCreateDisputeCall({ chain: mainnet, extraData: EXTRA_DATA, metaEvidenceUri: META_EVIDENCE, numberOfRulingOptions: 3n, cost: 123_456n }));
    expect(call).toMatchObject({ kind: "create-dispute", chainId: 1, address: mainnet.arbitrableProxy, functionName: "createDispute", value: 123_456n });
    expect(selectorOf(call)).toBe(toFunctionSelector("createDispute(bytes,string,uint256)"));
    expect(decodedArgs(call)).toEqual([EXTRA_DATA, META_EVIDENCE, 3n]);
  });

  it("§4.5: zero ruling options (uint and datetime, the contract maximum) are sent as 0", () => {
    const call = expectCall(buildCreateDisputeCall({ chain: chain(11155111), extraData: EXTRA_DATA, metaEvidenceUri: META_EVIDENCE, numberOfRulingOptions: 0n, cost: 1n }));
    expect(call.chainId).toBe(11155111);
    expect(call.address).toBe(chain(11155111).arbitrableProxy);
    expect(decodedArgs(call)[2]).toBe(0n);
  });

  it("§4.5: 2^n ruling options of a 32-option multiple-select fit the uint256 argument", () => {
    const call = expectCall(buildCreateDisputeCall({ chain: chain(1), extraData: EXTRA_DATA, metaEvidenceUri: META_EVIDENCE, numberOfRulingOptions: 2n ** 32n, cost: 1n }));
    expect(decodedArgs(call)[2]).toBe(2n ** 32n);
  });

  it("§4.2: a chain without an ArbitrableProxy cannot create disputes", () => {
    expect(buildCreateDisputeCall({ chain: chain(137), extraData: EXTRA_DATA, metaEvidenceUri: META_EVIDENCE, numberOfRulingOptions: 2n, cost: 1n })).toEqual({
      ok: false,
      refusal: "no-arbitrable-proxy",
    });
  });

  it("B16: an upload result that is not content-addressed never goes on-chain", () => {
    for (const metaEvidenceUri of [
      "",
      "https://evil.example/metaEvidence.json",
      `/ipfs/${EVIDENCE_CID}/../../ipns/x`,
      "/ipns/example.eth/metaEvidence.json",
      "/ipfs/not-a-cid/metaEvidence.json",
    ]) {
      expect(buildCreateDisputeCall({ chain: chain(1), extraData: EXTRA_DATA, metaEvidenceUri, numberOfRulingOptions: 2n, cost: 1n })).toEqual({
        ok: false,
        refusal: "not-content-addressed",
      });
    }
  });

  it("B16: an accepted upload result is written in its canonical form", () => {
    const call = expectCall(
      buildCreateDisputeCall({ chain: chain(1), extraData: EXTRA_DATA, metaEvidenceUri: `ipfs://${EVIDENCE_CID}/metaEvidence.json`, numberOfRulingOptions: 2n, cost: 1n }),
    );
    expect(decodedArgs(call)[1]).toBe(META_EVIDENCE);
  });

  it("§6.2: a negative ruling option count is not an encodable uint256 and is refused", () => {
    expect(buildCreateDisputeCall({ chain: chain(1), extraData: EXTRA_DATA, metaEvidenceUri: META_EVIDENCE, numberOfRulingOptions: -1n, cost: 1n })).toEqual({
      ok: false,
      refusal: "ruling-out-of-range",
    });
  });
});
