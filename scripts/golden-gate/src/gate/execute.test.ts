import { describe, expect, it } from "vitest";
import { REGISTRY } from "../../../../packages/core/src/registry";
import type { CidPath } from "../../../../packages/core/src/uri/types";
import type { ScriptResult } from "../../../../packages/core/src/types";
import type { NewRunInput, OldRunInput, OldRunOutput } from "../../browser/protocol";
import type { ScriptReference } from "../enumerate/enumerate";
import { toJson } from "../output";
import { executePlan, type ExecutionDeps } from "./execute";
import { planRuns, type RunPlan } from "./plan";

const ENV = { REACT_APP_WEB3_PROVIDER_URL: "https://mainnet.rpc.test/key" };
const DEFAULT_SCRIPT: CidPath = "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";
const REALITY_SCRIPT: CidPath = "QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js";
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

function deps(browser: ExecutionDeps["browser"], scripts: [CidPath, string | null][] = [[DEFAULT_SCRIPT, "function getMetaEvidence() {}"]]): ExecutionDeps {
  return { browser, scripts: new Map(scripts), oldRedirectMap: {}, rpcEnv: {}, oldTimeoutMs: 180_000, newTimeoutMs: 120_000 };
}

/** A Reality renderer holding reality-eth-lib's delimiter as a raw literal, and its output unsplit and split on it. */
const REALITY_TEXT = 'populatedJSONForTemplate(t.split("␟"))';
const BOOL_OPTIONS = { type: "single-select", titles: ["No", "Yes"] };
const UNSPLIT = { question: "test5555␟misc␟", rulingOptions: BOOL_OPTIONS };
const SPLIT = { question: "test5555", rulingOptions: BOOL_OPTIONS };
/** Listed by the arbitrable allowlist of chain 1, so today's frame is same-origin. */
const KLEROS_GOVERNOR: ScriptReference["arbitrable"] = "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4";

function realityPlan(arbitrable: ScriptReference["arbitrable"]): RunPlan {
  const [plan] = planRuns([{ ...REFERENCE, arbitrable, cid: REALITY_SCRIPT, scriptUri: `/ipfs/${REALITY_SCRIPT}` }], ENV, REGISTRY);
  if (plan === undefined) throw new Error("plan expected");
  return plan;
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

  it("C6: an opaque-frame Reality result whose question keeps the ␟ delimiter is reviewed by hand, not failed (D-29)", async () => {
    const browser = fakeBrowser([{ status: "result", result: UNSPLIT, jsonDuplicateKeys: false }], [{ status: "ok", value: SPLIT, jsonDuplicateKeys: false }]);
    const record = await executePlan(realityPlan(REFERENCE.arbitrable), deps(browser, [[REALITY_SCRIPT, REALITY_TEXT]]));
    expect(record).toMatchObject({ verdict: "improvement-for-review", earlierVerdicts: [], scriptKind: "reality", charsetSensitive: true });
    expect(record.production).toMatchObject({ frame: "opaque", outcome: { kind: "failure", failureClass: "garbled-result", value: UNSPLIT } });
    expect(browser.oldInputs).toHaveLength(1);
  });

  it("C6: a same-origin Reality result that keeps the ␟ delimiter stays a production success (D-29)", async () => {
    const browser = fakeBrowser([{ status: "result", result: UNSPLIT, jsonDuplicateKeys: false }], [{ status: "ok", value: SPLIT, jsonDuplicateKeys: false }]);
    const record = await executePlan(realityPlan(KLEROS_GOVERNOR), deps(browser, [[REALITY_SCRIPT, REALITY_TEXT]]));
    expect(record.production).toMatchObject({ frame: "same-origin", outcome: { kind: "success" } });
    expect(record.verdict).toBe("different-output");
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

  it("C6: a harness failure on one side is recorded apart from the script's outcome, retried once, and fails the run", async () => {
    const browser = fakeBrowser([{ status: "result", result: OUTPUT, jsonDuplicateKeys: false }, { status: "result", result: OUTPUT, jsonDuplicateKeys: false }], []);
    const record = await executePlan(PLAN, deps(browser));
    expect(record.newApp.outcome).toMatchObject({ kind: "harness-failure", detail: "the harness failed: no more new outputs" });
    expect(record).toMatchObject({ verdict: "harness-failure", earlierVerdicts: ["harness-failure"] });
    expect(browser.newInputs).toHaveLength(2);
  });

  it("C6: harness failures on both sides fail the run instead of matching as one failure class", async () => {
    const browser = fakeBrowser([], []);
    const record = await executePlan(PLAN, deps(browser));
    expect(record.production.outcome).toMatchObject({ kind: "harness-failure" });
    expect(record.newApp.outcome).toMatchObject({ kind: "harness-failure" });
    expect(record).toMatchObject({ verdict: "harness-failure", earlierVerdicts: ["harness-failure"] });
    expect(browser.oldInputs).toHaveLength(2);
    expect(browser.newInputs).toHaveLength(2);
  });

  it("Secrets: a run is recorded with its RPC parameters and the URLs of a failure's detail as host and fingerprint", async () => {
    const key = "0123456789abcdef0123456789abcdef";
    const keyed = `https://mainnet.rpc.test/v3/${key}`;
    const [plan] = planRuns([REFERENCE], { REACT_APP_WEB3_PROVIDER_URL: keyed }, REGISTRY);
    if (plan === undefined) throw new Error("plan expected");
    const failure = { status: "failed", reason: "script-error", message: `The dynamic script failed: fetch ${keyed} returned 429` } as const;
    const browser = fakeBrowser([{ status: "timeout" }], [failure]);
    const record = await executePlan(plan, deps(browser));
    // The runners get the real URL; only the record is redacted.
    expect(browser.oldInputs[0]?.scriptParameters).toMatchObject({ arbitratorJsonRpcUrl: keyed });
    expect(record.production.params).toMatchObject({ arbitratorJsonRpcUrl: expect.stringMatching(/^mainnet\.rpc\.test sha256:[\da-f]{12}$/) as unknown });
    expect(record.newApp.outcome).toMatchObject({ kind: "failure", detail: expect.stringMatching(/fetch mainnet\.rpc\.test sha256:[\da-f]{12} returned 429$/) as unknown });
    const written = toJson(record);
    expect(written.includes(key)).toBe(false);
    expect(written.includes(keyed)).toBe(false);
  });

  it("C6: a harness failure on one side fails the run whatever the other side's script did", async () => {
    const browser = fakeBrowser([{ status: "timeout" }, { status: "timeout" }], []);
    const record = await executePlan(PLAN, deps(browser));
    expect(record.production.outcome).toMatchObject({ kind: "failure", failureClass: "no-result" });
    expect(record.verdict).toBe("harness-failure");
  });
});
