import type { Decision, JuryDecisionNote } from "@dispute-resolver/core";

const APPEALABLE = "This decision can be appealed within the appeal period.";

const NOTES: Readonly<Record<JuryDecisionNote, string>> = {
  appealable: APPEALABLE,
  "appealable-in-arbitrable": `${APPEALABLE} Go to the arbitrable application to appeal this ruling.`,
  "not-appealable": "This dispute cannot be appealed.",
  "not-executed": "The ruling has not been executed yet.",
  "out-of-range": "The arbitrable contract reported a ruling that is not one of this dispute's options.",
  inconsistent: "The arbitrable contract reported conflicting rulings.",
};

export function decisionLine(decision: Exclude<Decision, { readonly kind: "none" }>): string {
  if (decision.kind === "jury-decision") return NOTES[decision.note];
  const { winner, court, wonBy, noun } = decision;
  switch (wonBy) {
    case "jury":
      return "Won by jury decision.";
    case "default":
      return `Won by default: “${winner.rulingText}” was the only ${noun} fully funded for the appeal. The court ruled “${court.rulingText}”.`;
    case "applied":
      return `The court ruled “${court.rulingText}”. The arbitrable contract applied “${winner.rulingText}”.`;
  }
}
