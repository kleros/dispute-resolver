import { SELECTORS } from "../abi";
import type { ProbeSignature } from "../abi/types";
import type { Hex } from "../types";
import type { AppealCapability, Capabilities, ProbedFamily } from "./types";

type Selectors = ReadonlySet<Hex>;

interface Row {
  readonly family: ProbedFamily;
  readonly matches: (selectors: Selectors) => boolean;
}

function carries(selectors: Selectors, signature: ProbeSignature): boolean {
  return selectors.has(SELECTORS[signature]);
}

const ESCROW_V1: Row = {
  family: "escrow-v1",
  matches: (selectors) => carries(selectors, "disputeIDtoTransactionID(uint256)") && !carries(selectors, "externalIDtoLocalID(uint256)"),
};

/** `submitEvidence(string)` alone is not enough: an unrelated contract carrying it would be funded through a governor's dialect. */
const GOVERNOR: Row = {
  family: "governor",
  matches: (selectors) => carries(selectors, "fundAppeal(uint256)") && carries(selectors, "getCurrentSessionNumber()"),
};

const IDR_V2: Row = { family: "idr-v2", matches: (selectors) => carries(selectors, "getTotalWithdrawableAmount(uint256,address,uint256)") };

const IDR_V1: Row = { family: "idr-v1", matches: (selectors) => carries(selectors, "getTotalWithdrawableAmount(uint256,address,uint256[])") };

/** Must come after IDR_V2 and IDR_V1: it matches on its own selector only because neither withdraw selector did. */
const IDR_LEGACY: Row = { family: "idr-legacy", matches: (selectors) => carries(selectors, "externalIDtoLocalID(uint256)") };

const WRITE_ROWS: readonly Row[] = [IDR_V2, IDR_V1, IDR_LEGACY];

/** Order matters: the first match wins. */
const ROWS: readonly Row[] = [ESCROW_V1, GOVERNOR, ...WRITE_ROWS];

const IDR_APPEAL: AppealCapability = { kind: "idr" };
const NO_APPEAL: AppealCapability = { kind: "none" };

const CAPABILITIES: Readonly<Record<ProbedFamily, (selectors: Selectors) => Capabilities>> = {
  "escrow-v1": () => ({ localId: "disputeIDtoTransactionID", evidence: { kind: "local-id" }, appeal: { kind: "escrow-pay-cost" }, withdraw: { kind: "none" } }),
  governor: (selectors) => ({
    localId: "none",
    evidence: carries(selectors, "submitEvidence(string)") ? { kind: "uri-only" } : { kind: "none" },
    appeal: { kind: "governor" },
    withdraw: { kind: "governor" },
  }),
  "idr-v2": () => ({ localId: "externalIDtoLocalID", evidence: { kind: "local-id" }, appeal: IDR_APPEAL, withdraw: { kind: "idr-v2" } }),
  "idr-v1": () => ({ localId: "externalIDtoLocalID", evidence: { kind: "local-id" }, appeal: IDR_APPEAL, withdraw: { kind: "idr-v1" } }),
  // Funding is refused: the deployed proxies fund parties with their own multipliers and window, not this dialect.
  "idr-legacy": () => ({ localId: "externalIDtoLocalID", evidence: { kind: "local-id" }, appeal: NO_APPEAL, withdraw: { kind: "unsupported" } }),
  "view-only": () => ({ localId: "none", evidence: { kind: "none" }, appeal: NO_APPEAL, withdraw: { kind: "none" } }),
};

function classifyRows(rows: readonly Row[], selectors: Selectors): { readonly family: ProbedFamily; readonly capabilities: Capabilities } {
  const family = rows.find((row) => row.matches(selectors))?.family ?? "view-only";
  return { family, capabilities: CAPABILITIES[family](selectors) };
}

export function classifySelectors(selectors: ReadonlySet<Hex>): { readonly family: ProbedFamily; readonly capabilities: Capabilities } {
  return classifyRows(ROWS, selectors);
}

/** The write family of a registered Reality proxy: only the IDisputeResolver rules apply. */
export function classifyRealityProxySelectors(selectors: ReadonlySet<Hex>): { readonly family: ProbedFamily; readonly capabilities: Capabilities } {
  return classifyRows(WRITE_ROWS, selectors);
}
