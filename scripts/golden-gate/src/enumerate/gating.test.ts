import { describe, expect, it } from "vitest";
import { REGISTRY } from "../../../../packages/core/src/registry";
import { gateScript } from "./gating";

const RESOLVER = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
const SEER_PROXY = "0x2018038203aee8e7a29dabd73771b0355d4f85ad";
const DEFAULT_SCRIPT = "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";

describe("which disputes reference a script (C6 enumeration, spec 9.1 gating order)", () => {
  it("C6: an allowlisted script of the arbitrator chain runs, keyed by its CID path", () => {
    const gate = gateScript({ title: "t", dynamicScriptURI: DEFAULT_SCRIPT }, 1, RESOLVER, REGISTRY);
    expect(gate).toMatchObject({ kind: "runs", cid: "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj" });
  });

  it("spec 10.4: a registered Reality proxy never runs its script, in either app", () => {
    const gate = gateScript({ dynamicScriptURI: "/ipfs/QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js" }, 1, SEER_PROXY, REGISTRY);
    expect(gate).toEqual({ kind: "skipped", reason: "registered-reality-proxy" });
  });

  it("A1: a script listed for another chain only is refused", () => {
    const gate = gateScript({ dynamicScriptURI: "/ipfs/QmX9qwsueTCvL7CRVi35BTTh3knDGCg9TFDqn25vth4Tf1" }, 100, RESOLVER, REGISTRY);
    expect(gate).toMatchObject({ kind: "refused", reason: "script-not-allowlisted" });
  });

  it("A3: a script URI that is not content-addressed is refused", () => {
    expect(gateScript({ dynamicScriptURI: "https://example.com/script.js" }, 1, RESOLVER, REGISTRY)).toMatchObject({ reason: "script-uri-not-content-addressed" });
    expect(gateScript({ dynamicScriptURI: 7 }, 1, RESOLVER, REGISTRY)).toMatchObject({ reason: "script-uri-not-content-addressed", scriptUri: "7" });
  });

  it("spec 9.1: a falsy script URI or a document that is not an object has no script", () => {
    expect(gateScript({ dynamicScriptURI: "" }, 1, RESOLVER, REGISTRY)).toEqual({ kind: "skipped", reason: "no-script" });
    expect(gateScript(["not", "an", "object"], 1, RESOLVER, REGISTRY)).toEqual({ kind: "skipped", reason: "not-an-object" });
  });
});
