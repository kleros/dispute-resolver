import { getOverride } from "../registry";
import type { Registry } from "../registry/types";
import type { AppealRoute, AppealRules, FamilyDetection, ProbedFamily, RulingNoun, TieDialect } from "./types";

const ROUTES: Readonly<Record<ProbedFamily, AppealRoute>> = {
  "idr-v2": "crowdfunding",
  "idr-v1": "crowdfunding",
  governor: "crowdfunding",
  "escrow-v1": "escrow",
  "idr-legacy": "unsupported",
  "view-only": "arbitrable",
};

function noun(family: FamilyDetection): RulingNoun {
  if (family.writeFamily === "governor") return "list";
  return family.family === "reality-proxy" ? "answer" : "option";
}

function tieDialect(registry: Registry, family: FamilyDetection, route: AppealRoute): TieDialect | null {
  if (route !== "crowdfunding") return null;
  if (family.writeFamily === "governor") return "shared-full-period";
  return getOverride(registry, family.chainId, family.arbitrable)?.refuseToArbitrateFundable === false ? "all-winner" : "refuse-is-winner";
}

/**
 * How a dispute of this arbitrable is appealed, decided from the detection and the registry only. Never reads the chain,
 * and never changes the family, the capabilities or the panel's arithmetic.
 */
export function describeAppealRules(registry: Registry, family: FamilyDetection): AppealRules {
  if (family.realityProxy?.appealable === false) return { route: "none", tie: null, noun: "answer" };
  const route = ROUTES[family.writeFamily];
  return { route, tie: tieDialect(registry, family, route), noun: noun(family) };
}
