import { describe, expect, it } from "vitest";
import { REGISTRY } from "../../../../packages/core/src/registry";
import type { ScriptResult } from "../../../../packages/core/src/types";
import type { NewRunInput, OldRunInput, OldRunOutput } from "../../browser/protocol";
import type { ScriptReference } from "../enumerate/enumerate";
import { executePlan, type ExecutionDeps } from "./execute";
import { planRuns } from "./plan";

const ENV = { REACT_APP_WEB3_PROVIDER_URL: "https://mainnet.rpc.test/key" };
const DEFAULT_SCRIPT = "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";
const REALITY_SCRIPT = "QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js";
const OUTPUT = { arbitrableInterfaceURI: "https://resolve.kleros.io/cases/1454" };

const REFERENCE: ScriptReference = {
  chainId: 1,
  disputeId: 1454,
  arbitrable: "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf",
  cid: DEFAULT_SCRIPT,
  scriptUri: `/ipfs/${DEFAULT_SCRIPT}`,
  metaEvidenceUri: "/ipfs/QmR6xPdDyaBw4pntZAdGJUiaV4SzUSJQweocwmGaBf3odU/metaEvidence.json",
  metaEvidenceSource: "meta-evidence-api",
  chainIdFields: {},
};

function fakeBrowser(oldOutputs: OldRunOutput[], newOutputs: ScriptResult[]): ExecutionDeps["browser"] & { oldInputs: OldRunInput[]; newInputs: NewRunInput[] } {
  const oldInputs: OldRunInput[] = [];
  const newInputs: NewRunInput[] = [];
  const diagnostics = { console: [], pageErrors: [], blockedRequests: 0 };
  return {
    oldInputs,
    newInputs,
    runOld: (input) => {
      oldInputs.push(input);
      const output = oldOutputs.shift();
      return output === undefined ? Promise.reject(new Error("no more old outputs")) : Promise.resolve({ output, diagnostics });
    },
    runNew: (input) => {
      newInputs.push(input);
      const output = newOutputs.shift();
      return output === undefined ? Promise.reject(new Error("no more new outputs")) : Promise.resolve({ output, diagnostics });
    },
  };
}

function deps(browser: ExecutionDeps["browser"], scripts: [string, string | null][] = [[DEFAULT_SCRIPT, "function getMetaEvidence() {}"]]): ExecutionDeps {
  return { browser, scripts: new Map(scripts), oldRedirectMap: {}, rpcEnv: {}, oldTimeoutMs: 180_000, newTimeoutMs: 120_000 };
}

const [PLAN] = planRuns([REFERENCE], ENV, REGISTRY);
if (PLAN === undefined) throw new Error("plan expected");

describe("one gate run (04 §5)", () => {
  it("C6: runs production's runner and the new runner on one dispute and compares their outputs", async () => {
    const browser = fakeBrowser([{ status: "result", result: OUTPUT, jsonDuplicateKeys: false }], [{ status: "ok", value: OUTPUT, jsonDuplicateKeys: false }]);
    const record = await executePlan(PLAN, deps(browser));
    expect(record).toMatchObject({ id: "1:1454", verdict: "identical", earlierVerdicts: [], scriptKind: "standard", charsetSensitive: false });
    expect(record.production.frame).toBe("opaque");
    expect(browser.oldInputs[0]).toMatchObject({ sandbox: "allow-scripts ", guardSource: "", timeoutMs: 180_000, scriptParameters: { disputeID: "1454", arbitratorChainID: "1" } });
    expect(browser.newInputs[0]?.request).toMatchObject({ kind: "standard", timeoutMs: 120_000, params: { disputeID: "1454", arbitratorChainID: 1 } });
  });

  it("A4: a Reality renderer runs with the duplicate-key guard in both runners", async () => {
    const reference = { ...REFERENCE, cid: REALITY_SCRIPT, scriptUri: `/ipfs/${REALITY_SCRIPT}` };
    const [plan] = planRuns([reference], ENV, REGISTRY);
    if (plan === undefined) throw new Error("plan expected");
    const browser = fakeBrowser([{ status: "result", result: OUTPUT, jsonDuplicateKeys: false }], [{ status: "ok", value: OUTPUT, jsonDuplicateKeys: false }]);
    await executePlan(plan, deps(browser, [[REALITY_SCRIPT, "populatedJSONForTemplate('␟')"]]));
    expect(browser.oldInputs[0]?.guardSource).toContain("jsonDuplicateKeyGuard");
    expect(browser.newInputs[0]?.request.kind).toBe("reality");
  });

  it("C6: a run failing on a missing result is run once more and keeps the second verdict", async () => {
    const browser = fakeBrowser(
      [{ status: "timeout" }, { status: "result", result: OUTPUT, jsonDuplicateKeys: false }],
      [
        { status: "ok", value: OUTPUT, jsonDuplicateKeys: false },
        { status: "ok", value: OUTPUT, jsonDuplicateKeys: false },
      ],
    );
    const record = await executePlan(PLAN, deps(browser));
    expect(record).toMatchObject({ verdict: "identical", earlierVerdicts: ["improvement-for-review"] });
  });

  it("C6: a different output is not retried", async () => {
    const browser = fakeBrowser([{ status: "result", result: OUTPUT, jsonDuplicateKeys: false }], [{ status: "ok", value: { other: true }, jsonDuplicateKeys: false }]);
    const record = await executePlan(PLAN, deps(browser));
    expect(record).toMatchObject({ verdict: "different-output", earlierVerdicts: [] });
  });

  it("C6: a script the gateway does not serve fails both sides alike without running", async () => {
    const browser = fakeBrowser([], []);
    const record = await executePlan(PLAN, deps(browser, [[DEFAULT_SCRIPT, null]]));
    expect(record).toMatchObject({ verdict: "same-failure-class", production: { outcome: { failureClass: "script-unavailable" } }, newApp: { outcome: { failureClass: "script-unavailable" } } });
    expect(browser.oldInputs).toHaveLength(0);
  });

  it("a harness failure is a runner error of that side, never an exception", async () => {
    const browser = fakeBrowser([{ status: "result", result: OUTPUT, jsonDuplicateKeys: false }, { status: "result", result: OUTPUT, jsonDuplicateKeys: false }], []);
    const record = await executePlan(PLAN, deps(browser));
    expect(record.newApp.outcome).toMatchObject({ kind: "failure", failureClass: "runner-error" });
    expect(record.verdict).toBe("new-runner-failed");
  });
});
