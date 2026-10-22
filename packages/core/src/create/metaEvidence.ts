import { REGISTRY } from "../registry";
import type { Registry } from "../registry/types";
import type { CreateDisputeInput, CreatedMetaEvidence } from "./types";

/** For uint and datetime, 0 stands for the contract maximum. */
export function numberOfRulingOptions(input: Pick<CreateDisputeInput, "questionType" | "options">): bigint {
  switch (input.questionType) {
    case "multiple-select":
      return 1n << BigInt(input.options.length);
    case "single-select":
      return BigInt(input.options.length);
    case "uint":
    case "datetime":
      return 0n;
  }
}

/** Trailing `""` entries are dropped so no option past the last described one shows an empty description. */
function optionDescriptions(options: CreateDisputeInput["options"]): string[] {
  const descriptions = options.map((option) => option.description);
  while (descriptions.at(-1) === "") descriptions.pop();
  return descriptions;
}

export function buildCreatedMetaEvidence(input: CreateDisputeInput, registry: Registry = REGISTRY): CreatedMetaEvidence {
  return {
    title: input.title,
    category: input.category,
    description: input.description,
    aliases: input.aliases,
    question: input.question,
    rulingOptions: {
      type: input.questionType,
      titles: input.options.map((option) => option.title),
      descriptions: optionDescriptions(input.options),
    },
    fileURI: input.primaryDocument ?? "",
    dynamicScriptURI: `/ipfs/${registry.defaultScriptCid}`,
  };
}
