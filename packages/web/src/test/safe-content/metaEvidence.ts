import type { MetaEvidence } from "@dispute-resolver/core";

/** A validated meta-evidence with every optional field empty, for tests that render or derive from one. */
export function testMetaEvidence(overrides: Partial<MetaEvidence> = {}): MetaEvidence {
  return {
    title: "Test dispute",
    description: "",
    question: null,
    category: null,
    rulingOptions: { type: "single-select", titles: ["Yes", "No"] },
    fallbackOutcomes: null,
    fileURI: null,
    evidenceDisplayInterfaceURI: null,
    arbitrableInterfaceURI: null,
    aliases: {},
    dynamicScriptURI: null,
    arbitratorChainID: { status: "absent" },
    arbitrableChainID: { status: "absent" },
    displayParamsVersion: null,
    realityQuestion: null,
    ...overrides,
  };
}
