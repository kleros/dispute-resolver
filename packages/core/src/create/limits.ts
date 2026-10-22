import type { CreateLimits } from "./types";

export const CREATE_LIMITS: CreateLimits = {
  optionRange: [2, 32],
  minVotes: 1,
};

export const MAX_UINT256 = 2n ** 256n - 1n;
