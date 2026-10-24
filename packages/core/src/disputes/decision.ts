import { formatRuling } from "../rulings";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";
import type { Period } from "../types";
import type { Compatibility, Decision } from "./types";

/**
 * In execution, when exactly one ruling of the current round was funded, that ruling won by default even if the jury's
 * current ruling differs.
 */
export function deriveDecision(input: {
  readonly period: Period;
  readonly currentRuling: bigint;
  readonly fundedRulings: readonly bigint[];
  readonly rulingOptions: RulingOptions | null;
  readonly fallbackOutcomes: FallbackOutcomes;
  readonly compatibility: Compatibility;
}): Decision {
  const { period, currentRuling, fundedRulings, rulingOptions, fallbackOutcomes } = input;
  const text = (ruling: bigint) => formatRuling(ruling, rulingOptions, fallbackOutcomes);
  switch (period) {
    case 3:
      return { kind: "jury-decision", ruling: currentRuling, rulingText: text(currentRuling), appealHint: input.compatibility === "view-only" };
    case 4: {
      const [funded] = fundedRulings;
      if (fundedRulings.length === 1 && funded !== undefined) return { kind: "winner", ruling: funded, rulingText: text(funded), wonBy: "default" };
      return { kind: "winner", ruling: currentRuling, rulingText: text(currentRuling), wonBy: "jury" };
    }
    default:
      return { kind: "none" };
  }
}
