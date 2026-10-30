import { describe, expect, it } from "vitest";
import { REGISTRY } from "../registry";
import type { Registry } from "../registry/types";
import type { CanonicalIpfsPath } from "../uri/types";
import type { CreateDisputeInput, CreateQuestionType } from "./types";
import { buildCreatedMetaEvidence, numberOfRulingOptions } from "./index";

const DOCUMENT: CanonicalIpfsPath = "/ipfs/QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA/contract.pdf";
const DEFAULT_SCRIPT = "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";

function options(count: number): CreateDisputeInput["options"] {
  return Array.from({ length: count }, (_, index) => ({ title: `Option ${String(index + 1)}`, description: index === 0 ? "The first" : "" }));
}

function input(overrides: Partial<CreateDisputeInput> = {}): CreateDisputeInput {
  return {
    courtId: 0n,
    votes: 3n,
    category: "Escrow",
    title: "Was the work delivered?",
    description: "A freelance contract.",
    questionType: "single-select",
    question: "Did the contractor deliver?",
    options: [
      { title: "Yes", description: "Pay the contractor" },
      { title: "No", description: "" },
    ],
    aliases: { "0x00000000000000000000000000000000000000aa": "Client", "0x00000000000000000000000000000000000000bb": "Contractor" },
    primaryDocument: DOCUMENT,
    ...overrides,
  };
}

describe("numberOfRulingOptions", () => {
  it("is n for single-select", () => {
    expect(numberOfRulingOptions({ questionType: "single-select", options: options(2) })).toBe(2n);
    expect(numberOfRulingOptions({ questionType: "single-select", options: options(32) })).toBe(32n);
  });

  it("is 2^n for multiple-select", () => {
    expect(numberOfRulingOptions({ questionType: "multiple-select", options: options(3) })).toBe(8n);
    expect(numberOfRulingOptions({ questionType: "multiple-select", options: options(32) })).toBe(2n ** 32n);
  });

  it("is 0, the contract maximum, for uint and datetime", () => {
    for (const questionType of ["uint", "datetime"] as const) {
      expect(numberOfRulingOptions({ questionType, options: [] })).toBe(0n);
      expect(numberOfRulingOptions({ questionType, options: options(2) })).toBe(0n);
    }
  });
});

describe("buildCreatedMetaEvidence", () => {
  it("writes every single-select field in a fixed key order", () => {
    const metaEvidence = buildCreatedMetaEvidence(input());
    expect(JSON.stringify(metaEvidence)).toBe(
      JSON.stringify({
        title: "Was the work delivered?",
        category: "Escrow",
        description: "A freelance contract.",
        aliases: { "0x00000000000000000000000000000000000000aa": "Client", "0x00000000000000000000000000000000000000bb": "Contractor" },
        question: "Did the contractor deliver?",
        rulingOptions: { type: "single-select", titles: ["Yes", "No"], descriptions: ["Pay the contractor"] },
        fileURI: DOCUMENT,
        dynamicScriptURI: DEFAULT_SCRIPT,
      }),
    );
  });

  it("multiple-select keeps the option titles and descriptions indexed alike", () => {
    const metaEvidence = buildCreatedMetaEvidence(input({ questionType: "multiple-select", options: options(3) }));
    expect(metaEvidence.rulingOptions).toEqual({ type: "multiple-select", titles: ["Option 1", "Option 2", "Option 3"], descriptions: ["The first"] });
  });

  it("a description typed for option 3 alone keeps its index, with empty entries before it", () => {
    const described = [
      { title: "Option 1", description: "" },
      { title: "Option 2", description: "" },
      { title: "Option 3", description: "The third" },
    ];
    expect(buildCreatedMetaEvidence(input({ options: described })).rulingOptions.descriptions).toEqual(["", "", "The third"]);
  });

  it("trailing options without a description add no entries, so descriptions never extend past the last described option", () => {
    const described = [
      { title: "Option 1", description: "" },
      { title: "Option 2", description: "The second" },
      { title: "Option 3", description: "" },
      { title: "Option 4", description: "" },
    ];
    expect(buildCreatedMetaEvidence(input({ options: described })).rulingOptions.descriptions).toEqual(["", "The second"]);
    const undescribed = described.map((option) => ({ ...option, description: "" }));
    expect(buildCreatedMetaEvidence(input({ options: undescribed })).rulingOptions.descriptions).toEqual([]);
  });

  it("uint and datetime carry no titles and no descriptions", () => {
    for (const questionType of ["uint", "datetime"] satisfies CreateQuestionType[]) {
      const metaEvidence = buildCreatedMetaEvidence(input({ questionType, options: [] }));
      expect(metaEvidence.rulingOptions).toEqual({ type: questionType, titles: [], descriptions: [] });
    }
  });

  it("fileURI is the empty string without a primary document", () => {
    expect(buildCreatedMetaEvidence(input({ primaryDocument: null })).fileURI).toBe("");
  });

  it("an empty category, description and alias map are kept as empty values", () => {
    const metaEvidence = buildCreatedMetaEvidence(input({ category: "", description: "", aliases: {} }));
    expect(metaEvidence).toMatchObject({ category: "", description: "", aliases: {} });
  });

  it("dynamicScriptURI is /ipfs/ + the registry's default script CID", () => {
    expect(buildCreatedMetaEvidence(input()).dynamicScriptURI).toBe(DEFAULT_SCRIPT);
    expect(`/ipfs/${REGISTRY.defaultScriptCid}`).toBe(DEFAULT_SCRIPT);
    const registry: Registry = { ...REGISTRY, defaultScriptCid: "QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA" };
    expect(buildCreatedMetaEvidence(input(), registry).dynamicScriptURI).toBe("/ipfs/QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA");
  });
});
