import { getOverride, getVerifiedArbitrable } from "../registry";
import type { Registry, Settlement, VerifiedArbitrable } from "../registry/types";
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

/** The entry when it describes this contract as detected: same family, and still not behind a proxy. */
function matchingEntry(registry: Registry, family: FamilyDetection): VerifiedArbitrable | undefined {
  const entry = getVerifiedArbitrable(registry, family.chainId, family.arbitrable);
  return entry?.family === family.writeFamily && family.implementation === null ? entry : undefined;
}

/**
 * What the Dispute Resolver can say about appealing a dispute of this arbitrable, decided from the detection and the
 * registry only. A registered Reality proxy is verified by its registration, which records no withdraw code, so it
 * promises no refund; any other contract is verified only by a verified entry. Never reads the chain, and never changes
 * the family, the capabilities or the panel's arithmetic.
 */
export function describeAppealRules(registry: Registry, family: FamilyDetection): AppealRules {
  const proxy = family.realityProxy;
  if (proxy?.appealable === false) return { route: "none", verified: true, settlement: "unknown", refundsWithoutAppeal: false, tie: null, noun: "answer" };
  const route = ROUTES[family.writeFamily];
  if (proxy !== null && route === "crowdfunding") {
    return { route, verified: true, settlement: "sole-funded-wins", refundsWithoutAppeal: false, tie: "refuse-is-winner", noun: "answer" };
  }
  const entry = matchingEntry(registry, family);
  const settlement: Settlement = entry?.settlement ?? "unknown";
  const refundsWithoutAppeal = entry?.refundsWithoutAppeal === true;
  return { route, verified: entry !== undefined, settlement, refundsWithoutAppeal, tie: tieDialect(registry, family, route), noun: noun(family) };
}
