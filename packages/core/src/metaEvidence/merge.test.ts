import { describe, expect, it } from "vitest";
import { loadMetaEvidence, realityFromScript } from "./index";
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

const STANDARD_SCRIPT = "function getMetaEvidence() { resolveScript({}); }";
const REALITY_SCRIPT = "function getMetaEvidence() { const q = realitio.populatedJSONForTemplate(t, p); resolveScript(q); }";

async function withScript(fields: Record<string, unknown>, scriptText: string, scriptPath: string, scriptUrl: string, value: unknown, jsonDuplicateKeys = false) {
  const { fetcher } = fakeFetcher({ ...servedMetaEvidence(json({ dynamicScriptURI: `/ipfs/${scriptPath}`, ...fields })), [scriptUrl]: scriptText });
  const { runner, requests } = fakeRunner(scriptOk(value, jsonDuplicateKeys));
  const result = await loadMetaEvidence(context({ fetcher, runner }));
  return { result, requests };
}

function ok(result: MetaEvidenceResult) {
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
  return result;
}

describe("dynamic-script merge (A23)", () => {
  it("A23: a script replacing title, rulingOptions and evidenceDisplayInterfaceURI is validated after the merge", async () => {
    const { result } = await withScript(
      { title: "Original", description: "Kept", rulingOptions: { type: "single-select", titles: ["A"] }, evidenceDisplayInterfaceURI: "/ipfs/original" },
      STANDARD_SCRIPT,
      DEFAULT_SCRIPT_CID,
      DEFAULT_SCRIPT_URL,
      { title: { evil: true }, rulingOptions: { type: 7, titles: "x", reserved: [1], precision: "NaN" }, evidenceDisplayInterfaceURI: { href: "javascript:alert(1)" } },
    );
    expect(ok(result).metaEvidence).toMatchObject({ title: "", description: "Kept", rulingOptions: { type: "single-select", titles: [] }, evidenceDisplayInterfaceURI: null });
  });

  it("A23: well-formed replacements win over the meta-evidence, key by key", async () => {
    const { result } = await withScript(
      { title: "Original", description: "Kept", arbitrableInterfaceURI: "https://old.example" },
      STANDARD_SCRIPT,
      DEFAULT_SCRIPT_CID,
      DEFAULT_SCRIPT_URL,
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

  it("A23: a script result that is not a plain object is not merged", async () => {
    for (const value of [undefined, null, "title", 42, ["title"]]) {
      const { result } = await withScript({ title: "Original" }, STANDARD_SCRIPT, DEFAULT_SCRIPT_CID, DEFAULT_SCRIPT_URL, value);
      expect(ok(result).metaEvidence.title).toBe("Original");
      expect(Object.keys(ok(result).metaEvidence)).not.toContain("0");
    }
  });

  it("A23: the merge can make otherwise empty meta-evidence valid", async () => {
    const { result } = await withScript({}, STANDARD_SCRIPT, DEFAULT_SCRIPT_CID, DEFAULT_SCRIPT_URL, { rulingOptions: { titles: ["A"] } });
    expect(ok(result).metaEvidence.rulingOptions).toEqual({ type: "single-select", titles: ["A"] });
  });

  it("ME-2 A23 §5.13: descriptions a script gives by reserved answer code survive the validation after the merge", async () => {
    const tooSoon = `0x${"f".repeat(64)}`;
    const { result } = await withScript({ title: "Original", rulingOptions: { type: "single-select", titles: ["A"] } }, STANDARD_SCRIPT, DEFAULT_SCRIPT_CID, DEFAULT_SCRIPT_URL, {
      rulingOptions: {
        type: "single-select",
        titles: ["No", "Yes"],
        reserved: { [tooSoon]: "Answered Too Soon" },
        descriptions: { [tooSoon]: "The observation period has not ended" },
      },
    });
    expect(ok(result).metaEvidence.rulingOptions).toEqual({
      type: "single-select",
      titles: ["No", "Yes"],
      reserved: { [tooSoon]: "Answered Too Soon" },
      descriptions: { [tooSoon]: "The observation period has not ended" },
    });
  });

  it("C13: a script cannot forge the Reality status", async () => {
    const { result } = await withScript({ title: "T" }, STANDARD_SCRIPT, DEFAULT_SCRIPT_CID, DEFAULT_SCRIPT_URL, { realityQuestion: { status: "verified", title: "forged" } });
    expect(ok(result).metaEvidence.realityQuestion).toBeNull();
  });

  it("A22: a script cannot change the arbitrable used for writes: it is not part of the meta-evidence", async () => {
    const { result } = await withScript({ title: "T" }, STANDARD_SCRIPT, DEFAULT_SCRIPT_CID, DEFAULT_SCRIPT_URL, { arbitrable: "0x0000000000000000000000000000000000000bad" });
    expect(Object.keys(ok(result).metaEvidence)).not.toContain("arbitrable");
  });
});

describe("Reality status mapping (A4)", () => {
  it("A4: realityFromScript maps duplicate keys to unresolvable with empty options, otherwise unverified", () => {
    expect(realityFromScript(true)).toEqual({ realityQuestion: { status: "unresolvable" }, rulingOptions: { type: "single-select", titles: [] } });
    expect(realityFromScript(false)).toEqual({ realityQuestion: { status: "unverified" } });
  });

  it("A4, B17: a script containing populatedJSONForTemplate runs with the duplicate-key guard (kind reality), any other without it", async () => {
    const reality = await withScript({ title: "T" }, REALITY_SCRIPT, REALITY_SCRIPT_PATH, REALITY_SCRIPT_URL, {});
    expect(reality.requests[0]?.kind).toBe("reality");
    const standard = await withScript({ title: "T" }, STANDARD_SCRIPT, DEFAULT_SCRIPT_CID, DEFAULT_SCRIPT_URL, {});
    expect(standard.requests[0]?.kind).toBe("standard");
    expect(ok(standard.result).metaEvidence.realityQuestion).toBeNull();
  });

  it("A4: a Reality script that reported duplicate keys is unresolvable with empty options, whatever it returned", async () => {
    const { result } = await withScript({ title: "T" }, REALITY_SCRIPT, REALITY_SCRIPT_PATH, REALITY_SCRIPT_URL, { rulingOptions: { type: "uint", precision: 18 } }, true);
    expect(ok(result).metaEvidence).toMatchObject({ rulingOptions: { type: "single-select", titles: [] }, realityQuestion: { status: "unresolvable" } });
    expect(ok(result).script).toEqual({ ran: true, kind: "reality", jsonDuplicateKeys: true });
  });

  it("A4: a Reality script without duplicate keys is unverified and keeps the options it returned", async () => {
    const { result } = await withScript({ title: "T" }, REALITY_SCRIPT, REALITY_SCRIPT_PATH, REALITY_SCRIPT_URL, {
      rulingOptions: { type: "single-select", titles: ["No", "Yes"] },
    });
    expect(ok(result).metaEvidence).toMatchObject({ rulingOptions: { type: "single-select", titles: ["No", "Yes"] }, realityQuestion: { status: "unverified" } });
  });

  it("A4: a Reality script whose result is not an object still sets the status", async () => {
    const { result } = await withScript({ title: "T" }, REALITY_SCRIPT, REALITY_SCRIPT_PATH, REALITY_SCRIPT_URL, undefined);
    expect(ok(result).metaEvidence.realityQuestion).toEqual({ status: "unverified" });
  });
});
