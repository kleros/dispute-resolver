import type { EvidenceLog, EvidencePageRequest, EvidencePageSlice } from "./types";

/** Entries per evidence page. Only the shown page's documents are read: the largest real disputes hold 77 and 69 entries. */
export const EVIDENCE_PAGE_SIZE = 50;

export const FIRST_EVIDENCE_PAGE: EvidencePageRequest = { order: "newest", page: 1 };

/**
 * Positions `[start, end)` of newest-first order as indices into chain-ordered `logs`: newer blocks first, chain order
 * kept inside a block, so a block cut by a page boundary reads on in the same direction on the next page.
 */
function newestFirstIndices(logs: readonly EvidenceLog[], start: number, end: number): number[] {
  const indices: number[] = [];
  let position = 0;
  let blockEnd = logs.length;
  while (blockEnd > 0 && position < end) {
    const block = logs[blockEnd - 1]?.blockNumber;
    let blockStart = blockEnd - 1;
    while (blockStart > 0 && logs[blockStart - 1]?.blockNumber === block) blockStart -= 1;
    for (let index = blockStart; index < blockEnd && position < end; index += 1) {
      if (position >= start) indices.push(index);
      position += 1;
    }
    blockEnd = blockStart;
  }
  return indices;
}

/** `logs` must be in chain order (block, then log index), as `loadEvidence` gives them. */
export function evidencePage(logs: readonly EvidenceLog[], request: EvidencePageRequest): EvidencePageSlice {
  const total = logs.length;
  const pageCount = Math.max(1, Math.ceil(total / EVIDENCE_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(request.page)));
  const start = (page - 1) * EVIDENCE_PAGE_SIZE;
  const end = Math.min(total, start + EVIDENCE_PAGE_SIZE);
  const pageLogs = request.order === "oldest" ? logs.slice(start, end) : newestFirstIndices(logs, start, end).flatMap((index) => logs[index] ?? []);
  let disputeRaised: EvidencePageSlice["disputeRaised"] = null;
  if (total > 0 && request.order === "oldest" && page === 1) disputeRaised = "first";
  else if (total > 0 && request.order === "newest" && page === pageCount) disputeRaised = "last";
  return { page, pageCount, total, start, end, logs: pageLogs, disputeRaised };
}
