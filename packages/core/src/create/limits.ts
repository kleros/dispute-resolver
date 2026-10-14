import type { CreateLimits } from "./types";

/** The Create form's limits (spec 4.3): 2 to 32 ruling options, at least one vote, and the fields `required` today. */
export const CREATE_LIMITS: CreateLimits = {
  optionRange: [2, 32],
  minVotes: 1,
  requiredFields: ["courtId", "votes", "title", "question", "optionTitles"],
};

/** The largest value of a uint256 word: the bound of the court ID and the vote count in `extraData` (spec 4.5). */
export const MAX_UINT256 = 2n ** 256n - 1n;
