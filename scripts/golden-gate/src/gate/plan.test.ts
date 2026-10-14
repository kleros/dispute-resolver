import { describe, expect, it } from "vitest";
import { REGISTRY } from "../../../../packages/core/src/registry";
import type { ScriptReference } from "../enumerate/enumerate";
import { planRuns } from "./plan";

const ENV = { REACT_APP_WEB3_PROVIDER_URL: "https://mainnet.rpc.test/key", REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://gnosis.rpc.test/key" };
const QMDPXX = "QmdpXXmNxmdmLqZCabRUC9bZ65c2BN54EuUTRi5SdtiHQ4";

function reference(overrides: Partial<ScriptReference>): ScriptReference {
  return {
    chainId: 1,
    disputeId: 1454,
    arbitrable: "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf",
    cid: "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj",
    scriptUri: "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj",
    metaEvidenceUri: "/ipfs/QmR6xPdDyaBw4pntZAdGJUiaV4SzUSJQweocwmGaBf3odU/metaEvidence.json",
    metaEvidenceSource: "meta-evidence-api",
    chainIdFields: {},
    ...overrides,
  };
}

describe("gate run plan (04 §5)", () => {
  it("C6: production and the new app run the same script on the same dispute, each with its own parameters", () => {
    const [plan] = planRuns([reference({})], ENV, REGISTRY);
    expect(plan).toMatchObject({
      id: "1:1454",
      purpose: "production-vs-new-app",
      old: { scriptCid: "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj", sandbox: "allow-scripts ", params: { ok: true, params: { arbitratorChainID: "1", arbitrableContractAddress: "0x99489D7bb33539F3D1A401741E56e8f02B9AE0Cf" } } },
      new: { scriptCid: "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj", params: { ok: true, value: { arbitratorChainID: 1, arbitrableContractAddress: "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf" } } },
    });
  });

  it("D-25: dispute 1621 runs Qmf1k7… in the old runner only, plus a runner-only run of QmdpXX… on both", () => {
    const plans = planRuns([reference({ disputeId: 1621, arbitrable: "0x327a29fce0a6490e4236240be176daa282eccfdf", cid: QMDPXX, scriptUri: `/ipfs/${QMDPXX}` })], ENV, REGISTRY);
    expect(plans.map((plan) => [plan.id, plan.old.scriptCid, plan.new.scriptCid])).toEqual([
      ["1:1621", "Qmf1k727vP7qZv21MDB8vwL6tfVEKPCUQAiw8CTfHStkjf", QMDPXX],
      ["1:1621/runner-only", QMDPXX, QMDPXX],
    ]);
  });

  it("D-25: the override applies on mainnet only", () => {
    const plans = planRuns([reference({ chainId: 100, disputeId: 1621, cid: QMDPXX })], ENV, REGISTRY);
    expect(plans.map((plan) => plan.old.scriptCid)).toEqual([QMDPXX]);
  });

  it("B5: a chain ID the new app refuses still runs in production when the old network map has it", () => {
    const [plan] = planRuns([reference({ chainIdFields: { arbitratorChainID: "0x1" } })], ENV, REGISTRY);
    expect(plan?.old.params).toMatchObject({ ok: true, params: { arbitratorChainID: "0x1" } });
    expect(plan?.new.params.ok).toBe(false);
  });
});
