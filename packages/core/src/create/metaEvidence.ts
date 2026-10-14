import { REGISTRY } from "../registry";
import type { Registry } from "../registry/types";
import type { CreateDisputeInput, CreatedMetaEvidence } from "./types";

/**
 * The `numberOfRulingOptions` argument of `createDispute` (spec 4.5 step 2): 2ⁿ for multiple-select, n for
 * single-select, and 0 (the contract maximum) for uint and datetime.
 */
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

/**
 * The option descriptions, each at its option's index with `""` where none was typed, without the trailing `""` entries
 * (P-09): `descriptions` never extends past the last described option, so no option shows an empty description.
 */
function optionDescriptions(options: CreateDisputeInput["options"]): string[] {
  const descriptions = options.map((option) => option.description);
  while (descriptions.at(-1) === "") descriptions.pop();
  return descriptions;
}

/**
 * The meta-evidence the Create page uploads (spec 4.5 step 4), keys in today's order. Option titles and descriptions
 * are indexed alike (P-09); `fileURI` is the validated document path or `""`; the script is the registry's default.
 */
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
