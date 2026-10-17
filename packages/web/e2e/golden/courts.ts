import { caseKey } from "./stableTier";

// D-39: the court of every golden case and whether it hides votes, which decides whether the new app's timeline has a
// Commit column. Read on 2026-10-16 from KlerosLiquid: `disputes(id).subcourtID`, then `courts(subcourtID).hiddenVotes`,
// at the block of the case's chain below. Every case is executed, so the dispute's court no longer changes; a court's
// `hiddenVotes` is a governance parameter, and a run that finds the timeline changed because it was flipped re-records it.

/** The block each chain's courts were read at. */
export const COURTS_READ_AT_BLOCK: Readonly<Record<number, number>> = {
  1: 26_203_247,
  100: 48_781_893,
  11155111: 11_925_599,
};

export interface RecordedCourt {
  readonly subcourtId: number;
  readonly hiddenVotes: boolean;
}

const court = (subcourtId: number, hiddenVotes = false): RecordedCourt => ({ subcourtId, hiddenVotes });

const RECORDED: Readonly<Record<string, RecordedCourt>> = {
  "1:92": court(0),
  "1:150": court(0),
  "1:168": court(0),
  "1:328": court(0),
  "1:505": court(8),
  "1:535": court(4),
  "1:560": court(23),
  "1:878": court(2),
  "1:912": court(9),
  "1:913": court(9),
  "1:1100": court(2),
  "1:1226": court(4),
  "1:1255": court(2),
  "1:1454": court(8),
  "1:1586": court(0),
  "1:1621": court(4),
  "1:1646": court(23),
  "1:1649": court(0),
  "1:1650": court(0),
  "1:1657": court(0),
  "1:1658": court(24),
  "1:1659": court(4),
  "1:1661": court(0),
  "1:1665": court(24),
  "1:1666": court(24),
  "1:1667": court(23),
  "1:1668": court(24),
  "1:1672": court(4),
  "1:1673": court(4),
  "1:1674": court(23),
  "1:1676": court(4),
  "1:1677": court(4),
  "1:1678": court(4),
  // Gnosis courts 0 and 19 hide votes.
  "100:0": court(0, true),
  "100:41": court(1),
  "100:42": court(1),
  "100:44": court(0, true),
  "100:58": court(1),
  "100:115": court(0, true),
  "100:118": court(1),
  "100:120": court(1),
  "100:121": court(1),
  "100:132": court(16),
  "100:140": court(13),
  "100:220": court(1),
  "100:229": court(1),
  "100:416": court(1),
  "100:431": court(17),
  "100:454": court(13),
  "100:460": court(1),
  "100:863": court(0, true),
  "100:1022": court(19, true),
  "11155111:365": court(0),
};

/** The recorded court of a golden case, or `null` for a dispute the table does not hold (a live-tier pick). */
export function recordedCourt(chainId: number, disputeId: number): RecordedCourt | null {
  return RECORDED[caseKey(chainId, disputeId)] ?? null;
}
