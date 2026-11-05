import type { Decision, JuryDecisionNote, RulingFact } from "@dispute-resolver/core";
import { hasVisibleText } from "../../ui";

const APPEALABLE = "This decision can be appealed within the appeal period.";

const NOTES: Readonly<Record<JuryDecisionNote, string>> = {
  appealable: APPEALABLE,
  "appealable-in-arbitrable": `${APPEALABLE} Go to the arbitrable application to appeal this ruling.`,
  "not-appealable": "This dispute cannot be appealed.",
  "not-executed": "The ruling has not been executed yet.",
  "out-of-range": "The arbitrable contract reported a ruling that is not one of this dispute's options.",
  inconsistent: "The arbitrable contract reported conflicting rulings.",
};

/** A ruling can read as nothing (a blank title, or a multiple-select without titles); its quoted clause is then dropped. */
function named(fact: RulingFact): boolean {
  return hasVisibleText(fact.rulingText);
}

function courtRuled(court: RulingFact): string[] {
  return named(court) ? [`The court ruled “${court.rulingText}”.`] : [];
}

export function decisionLine(decision: Exclude<Decision, { readonly kind: "none" }>): string {
  if (decision.kind === "jury-decision") return NOTES[decision.note];
  const { winner, court, wonBy, noun } = decision;
  switch (wonBy) {
    case "jury":
      return "Won by jury decision.";
    case "default": {
      const funded = named(winner)
        ? `Won by default: “${winner.rulingText}” was the only ${noun} fully funded for the appeal.`
        : `Won by default as the only ${noun} fully funded for the appeal.`;
      return [funded, ...courtRuled(court)].join(" ");
    }
    case "applied": {
      const applied = named(winner) ? `The arbitrable contract applied “${winner.rulingText}”.` : "The arbitrable contract applied a ruling other than the court's.";
      return [...courtRuled(court), applied].join(" ");
    }
  }
}
