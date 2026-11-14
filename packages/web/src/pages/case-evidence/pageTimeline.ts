import {
  compareBigint,
  type AppealDecisionEvent,
  type EvidenceEntry,
  type EvidenceList,
  type EvidenceLog,
  type EvidenceOrder,
  type EvidencePageSlice,
  type HiddenEvidenceReason,
} from "@dispute-resolver/core";

type ShownEntry = Extract<EvidenceEntry, { readonly status: "shown" | "too-large" }>;

export type TimelineRow = { readonly kind: "evidence"; readonly entry: ShownEntry } | { readonly kind: "appealed"; readonly decision: AppealDecisionEvent };

export interface PageTimeline {
  readonly rows: readonly TimelineRow[];
  /** The page's own hidden entries, counted by reason. */
  readonly hidden: Pick<EvidenceList, "hiddenEvidenceCount" | "hiddenByReason">;
}

function placeKey(place: { readonly blockNumber: bigint; readonly logIndex: number }): string {
  return `${place.blockNumber.toString()}:${String(place.logIndex)}`;
}

/**
 * How many entries come before an appeal in `order`. Its block's entries come before it newest first and after it oldest
 * first: the order of an appeal and an entry in the same block is not read.
 */
function entriesBefore(logs: readonly EvidenceLog[], decision: AppealDecisionEvent, order: EvidenceOrder): number {
  let count = 0;
  for (const log of logs) if (order === "newest" ? log.blockNumber >= decision.blockNumber : log.blockNumber < decision.blockNumber) count += 1;
  return count;
}

function comesBefore(decision: AppealDecisionEvent, log: EvidenceLog, order: EvidenceOrder): boolean {
  return order === "newest" ? decision.blockNumber > log.blockNumber : decision.blockNumber <= log.blockNumber;
}

/**
 * The rows of one page `list` holds, in `order`: its shown and too-large entries, and the "Appealed" markers on it. A
 * marker belongs to the page of the entry just before it, or to page 1 when none is, so each marker lands on one page.
 */
export function pageTimeline(list: EvidenceList, slice: EvidencePageSlice, order: EvidenceOrder, decisions: readonly AppealDecisionEvent[]): PageTimeline {
  const markers = decisions
    .filter((decision) => {
      const before = entriesBefore(list.logs, decision, order);
      return before === 0 ? slice.page === 1 : before > slice.start && before <= slice.end;
    })
    .sort((a, b) => (order === "newest" ? compareBigint(b.blockNumber, a.blockNumber) : compareBigint(a.blockNumber, b.blockNumber)));
  const entries = new Map(list.entries.map((entry) => [placeKey(entry), entry]));
  const hiddenByReason: Record<HiddenEvidenceReason, number> = { undecodable: 0, "not-content-addressed": 0, "fetch-failed": 0, "not-json": 0, "schema-invalid": 0 };
  const rows: TimelineRow[] = [];
  let next = 0;
  for (const log of slice.logs) {
    for (let marker = markers[next]; marker !== undefined && comesBefore(marker, log, order); marker = markers[next]) {
      rows.push({ kind: "appealed", decision: marker });
      next += 1;
    }
    const entry = entries.get(placeKey(log));
    if (entry?.status === "hidden") hiddenByReason[entry.reason] += 1;
    else if (entry !== undefined) rows.push({ kind: "evidence", entry });
  }
  for (const marker of markers.slice(next)) rows.push({ kind: "appealed", decision: marker });
  const hiddenEvidenceCount = Object.values(hiddenByReason).reduce((sum, count) => sum + count, 0);
  return { rows, hidden: { hiddenEvidenceCount, hiddenByReason } };
}
