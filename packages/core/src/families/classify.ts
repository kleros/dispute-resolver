import { SELECTORS } from "../abi";
import type { ProbeSignature } from "../abi/types";
import type { Hex } from "../types";
import type { AppealCapability, Capabilities, ProbedFamily } from "./types";

type Selectors = ReadonlySet<Hex>;

/** One row of 06 §1 decided by bytecode. */
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

const GOVERNOR: Row = {
  family: "governor",
  matches: (selectors) =>
    (carries(selectors, "submitEvidence(string)") && !carries(selectors, "submitEvidence(uint256,string)")) ||
    (carries(selectors, "fundAppeal(uint256)") && carries(selectors, "getCurrentSessionNumber()")),
};

const IDR_V2: Row = { family: "idr-v2", matches: (selectors) => carries(selectors, "getTotalWithdrawableAmount(uint256,address,uint256)") };

const IDR_V1: Row = { family: "idr-v1", matches: (selectors) => carries(selectors, "getTotalWithdrawableAmount(uint256,address,uint256[])") };

/** Reached only when neither withdraw selector matched, so the "neither withdraw selector" half of the rule holds. */
const IDR_LEGACY: Row = { family: "idr-legacy", matches: (selectors) => carries(selectors, "externalIDtoLocalID(uint256)") };

/** Rows 4–6: the only rows that give a registered Reality proxy its write family (06 §1 row 1). */
const WRITE_ROWS: readonly Row[] = [IDR_V2, IDR_V1, IDR_LEGACY];

/** Rows 2–6 in detection order; row 7 (`view-only`) is the fallback. */
const ROWS: readonly Row[] = [ESCROW_V1, GOVERNOR, ...WRITE_ROWS];

const IDR_APPEAL: AppealCapability = { kind: "idr", fundAppeal: "fundAppeal(uint256,uint256)" };
const IDR_UINT8_APPEAL: AppealCapability = { kind: "idr", fundAppeal: "fundAppeal(uint256,uint8)" };
const NO_APPEAL: AppealCapability = { kind: "none" };

/** idr-legacy funds through whichever `fundAppeal` the code carries, preferring the IDisputeResolver one (D-46). */
function legacyAppeal(selectors: Selectors): AppealCapability {
  if (carries(selectors, "fundAppeal(uint256,uint256)")) return IDR_APPEAL;
  if (carries(selectors, "fundAppeal(uint256,uint8)")) return IDR_UINT8_APPEAL;
  return NO_APPEAL;
}

/** The 06 §1 behavior column for each family (D-46, D-47, D-49). */
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
  "idr-legacy": (selectors) => ({ localId: "externalIDtoLocalID", evidence: { kind: "local-id" }, appeal: legacyAppeal(selectors), withdraw: { kind: "unsupported" } }),
  "view-only": () => ({ localId: "none", evidence: { kind: "none" }, appeal: NO_APPEAL, withdraw: { kind: "none" } }),
};

function classifyRows(rows: readonly Row[], selectors: Selectors): { readonly family: ProbedFamily; readonly capabilities: Capabilities } {
  const family = rows.find((row) => row.matches(selectors))?.family ?? "view-only";
  return { family, capabilities: CAPABILITIES[family](selectors) };
}

/** Rows 2–7 of 06 §1 in order, first match wins, with the capabilities of the matched family. */
export function classifySelectors(selectors: ReadonlySet<Hex>): { readonly family: ProbedFamily; readonly capabilities: Capabilities } {
  return classifyRows(ROWS, selectors);
}

/** The write family of a registered Reality proxy: rows 4–6 only, `view-only` when none matches (06 §1 row 1). */
export function classifyRealityProxySelectors(selectors: ReadonlySet<Hex>): { readonly family: ProbedFamily; readonly capabilities: Capabilities } {
  return classifyRows(WRITE_ROWS, selectors);
}
