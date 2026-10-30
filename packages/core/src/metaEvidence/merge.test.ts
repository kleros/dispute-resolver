import { describe, expect, it } from "vitest";
import { loadMetaEvidence } from "./index";
import {
  DEFAULT_SCRIPT_CID,
  DEFAULT_SCRIPT_URL,
  REALITY_SCRIPT_PATH,
  REALITY_SCRIPT_URL,
  context,
  fakeFetcher,
  fakeRunner,
  json,
  scriptOk,
  servedMetaEvidence,
} from "../test/metaEvidence/testHelpers";
import type { MetaEvidenceResult } from "./types";

const STANDARD_SCRIPT = { text: "function getMetaEvidence() { resolveScript({}); }", path: DEFAULT_SCRIPT_CID, url: DEFAULT_SCRIPT_URL };
const REALITY_SCRIPT = {
  text: "function getMetaEvidence() { const q = realitio.populatedJSONForTemplate(t, p); resolveScript(q); }",
  path: REALITY_SCRIPT_PATH,
  url: REALITY_SCRIPT_URL,
};

async function withScript(fields: Record<string, unknown>, value: unknown, script = STANDARD_SCRIPT, jsonDuplicateKeys = false) {
  const { fetcher } = fakeFetcher({ ...servedMetaEvidence(json({ dynamicScriptURI: `/ipfs/${script.path}`, ...fields })), [script.url]: script.text });
  const { runner, requests } = fakeRunner(scriptOk(value, jsonDuplicateKeys));
  const result = await loadMetaEvidence(context({ fetcher, runner }));
  return { result, requests };
}

function ok(result: MetaEvidenceResult) {
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result;
}

describe("dynamic-script merge", () => {
  it("a script replacing title, rulingOptions and evidenceDisplayInterfaceURI is validated after the merge", async () => {
    const { result } = await withScript(
      { title: "Original", description: "Kept", rulingOptions: { type: "single-select", titles: ["A"] }, evidenceDisplayInterfaceURI: "/ipfs/original" },
      { title: { evil: true }, rulingOptions: { type: 7, titles: "x", reserved: [1], precision: "NaN" }, evidenceDisplayInterfaceURI: { href: "javascript:alert(1)" } },
    );
    expect(ok(result).metaEvidence).toMatchObject({ title: "", description: "Kept", rulingOptions: { type: "single-select", titles: [] }, evidenceDisplayInterfaceURI: null });
  });

  it("well-formed replacements win over the meta-evidence, key by key", async () => {
    const { result } = await withScript(
      { title: "Original", description: "Kept", arbitrableInterfaceURI: "https://old.example" },
      {
        title: "From the script",
        arbitrableInterfaceURI: "https://resolve.kleros.io",
        rulingOptions: { type: "multiple-select", titles: ["X", "Y"] },
      },
    );
    expect(ok(result).metaEvidence).toMatchObject({
      title: "From the script",
      description: "Kept",
      arbitrableInterfaceURI: "https://resolve.kleros.io",
      rulingOptions: { type: "multiple-select", titles: ["X", "Y"] },
    });
  });

  it("a script result that is not a plain object is not merged", async () => {
    for (const value of [undefined, null, "title", 42, ["title"]]) {
      const { result } = await withScript({ title: "Original" }, value);
      expect(ok(result).metaEvidence.title).toBe("Original");
      expect(Object.keys(ok(result).metaEvidence)).not.toContain("0");
    }
  });

  it("the merge can make otherwise empty meta-evidence valid", async () => {
    const { result } = await withScript({}, { rulingOptions: { titles: ["A"] } });
    expect(ok(result).metaEvidence.rulingOptions).toEqual({ type: "single-select", titles: ["A"] });
  });

  it("a script cannot forge the Reality status", async () => {
    const { result } = await withScript({ title: "T" }, { realityQuestion: { status: "verified", title: "forged" } });
    expect(ok(result).metaEvidence.realityQuestion).toBeNull();
  });

  it("a script cannot change the arbitrable used for writes: it is not part of the meta-evidence", async () => {
    const { result } = await withScript({ title: "T" }, { arbitrable: "0x0000000000000000000000000000000000000bad" });
    expect(Object.keys(ok(result).metaEvidence)).not.toContain("arbitrable");
  });
});

describe("Reality status mapping", () => {
  it("a script containing populatedJSONForTemplate runs with the duplicate-key guard (kind reality), any other without it", async () => {
    const reality = await withScript({ title: "T" }, {}, REALITY_SCRIPT);
    expect(reality.requests[0]?.kind).toBe("reality");
    const standard = await withScript({ title: "T" }, {});
    expect(standard.requests[0]?.kind).toBe("standard");
    expect(ok(standard.result).metaEvidence.realityQuestion).toBeNull();
  });

  it("a Reality script that reported duplicate keys is unresolvable with empty options, whatever it returned", async () => {
    const { result } = await withScript({ title: "T" }, { rulingOptions: { type: "uint", precision: 18 } }, REALITY_SCRIPT, true);
    expect(ok(result).metaEvidence).toMatchObject({ rulingOptions: { type: "single-select", titles: [] }, realityQuestion: { status: "unresolvable" } });
    expect(ok(result).script).toEqual({ ran: true, kind: "reality", jsonDuplicateKeys: true });
  });

  it("a Reality script without duplicate keys is unverified and keeps the options it returned", async () => {
    const { result } = await withScript({ title: "T" }, { rulingOptions: { type: "single-select", titles: ["No", "Yes"] } }, REALITY_SCRIPT);
    expect(ok(result).metaEvidence).toMatchObject({ rulingOptions: { type: "single-select", titles: ["No", "Yes"] }, realityQuestion: { status: "unverified" } });
  });

  it("a Reality script whose result is not an object still sets the status", async () => {
    const { result } = await withScript({ title: "T" }, undefined, REALITY_SCRIPT);
    expect(ok(result).metaEvidence.realityQuestion).toEqual({ status: "unverified" });
  });
});
