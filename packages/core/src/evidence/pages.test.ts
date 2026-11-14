import { describe, expect, it } from "vitest";
import type { EvidenceLog } from "./types";
import { evidencePage } from "./index";
import { EVIDENCE_PAGE_SIZE } from "./pages";

/** One log per `[block, logIndex]`, in the order given, which must be chain order. */
function logs(places: readonly (readonly [number, number])[]): EvidenceLog[] {
  return places.map(([block, logIndex]) => ({
    blockNumber: BigInt(block),
    logIndex,
    transactionHash: `0x${block.toString(16).padStart(4, "0")}${logIndex.toString(16).padStart(4, "0")}`,
    decoded: { evidenceUri: `/ipfs/QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA/${String(block)}-${String(logIndex)}`, submitter: "0x2222222222222222222222222222222222222222" },
  }));
}

/** `count` logs, one per block from block 1. */
function oneEach(count: number): EvidenceLog[] {
  return logs(Array.from({ length: count }, (_, index) => [index + 1, 0] as const));
}

const places = (list: readonly EvidenceLog[]) => list.map((log) => `${String(log.blockNumber)}:${String(log.logIndex)}`);
const blocks = (list: readonly EvidenceLog[]) => list.map((log) => Number(log.blockNumber));

describe("evidencePage", () => {
  it("pages hold 50 entries", () => {
    expect(EVIDENCE_PAGE_SIZE).toBe(50);
  });

  it("50 entries or fewer make one page holding every entry, in either order", () => {
    const all = oneEach(50);
    for (const order of ["newest", "oldest"] as const) {
      const slice = evidencePage(all, { order, page: 1 });
      expect(slice).toMatchObject({ page: 1, pageCount: 1, total: 50, start: 0, end: 50 });
      expect(slice.logs).toHaveLength(50);
    }
  });

  it("newest first, 120 entries: page 1 is the 50 newest, page 3 the 20 oldest, each newest first", () => {
    const all = oneEach(120);
    const first = evidencePage(all, { order: "newest", page: 1 });
    expect(first).toMatchObject({ page: 1, pageCount: 3, total: 120, start: 0, end: 50 });
    expect(blocks(first.logs)).toEqual(Array.from({ length: 50 }, (_, index) => 120 - index));
    const last = evidencePage(all, { order: "newest", page: 3 });
    expect(last).toMatchObject({ page: 3, start: 100, end: 120 });
    expect(blocks(last.logs)).toEqual(Array.from({ length: 20 }, (_, index) => 20 - index));
  });

  it("oldest first, 120 entries: page 1 is the 50 oldest, page 3 the 20 newest, each oldest first", () => {
    const all = oneEach(120);
    expect(blocks(evidencePage(all, { order: "oldest", page: 1 }).logs)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(blocks(evidencePage(all, { order: "oldest", page: 3 }).logs)).toEqual(Array.from({ length: 20 }, (_, index) => index + 101));
  });

  it("51 entries make two pages, the second holding one entry", () => {
    const all = oneEach(51);
    expect(evidencePage(all, { order: "newest", page: 2 })).toMatchObject({ page: 2, pageCount: 2, start: 50, end: 51 });
    expect(blocks(evidencePage(all, { order: "newest", page: 2 }).logs)).toEqual([1]);
    expect(blocks(evidencePage(all, { order: "oldest", page: 2 }).logs)).toEqual([51]);
  });

  it("a page past the last opens the last page, and a page below 1 opens page 1", () => {
    const all = oneEach(60);
    expect(evidencePage(all, { order: "newest", page: 9 })).toMatchObject({ page: 2, start: 50, end: 60 });
    expect(evidencePage(all, { order: "newest", page: 0 })).toMatchObject({ page: 1, start: 0, end: 50 });
  });

  it("newest first lists newer blocks first but keeps chain order inside a block", () => {
    const all = logs([
      [10, 0],
      [10, 4],
      [20, 1],
      [20, 2],
      [20, 7],
      [30, 0],
    ]);
    expect(places(evidencePage(all, { order: "newest", page: 1 }).logs)).toEqual(["30:0", "20:1", "20:2", "20:7", "10:0", "10:4"]);
  });

  it("oldest first keeps chain order inside a block", () => {
    const all = logs([
      [10, 0],
      [10, 4],
      [20, 1],
      [20, 2],
    ]);
    expect(places(evidencePage(all, { order: "oldest", page: 1 }).logs)).toEqual(["10:0", "10:4", "20:1", "20:2"]);
  });

  it("a block cut by a page boundary keeps chain order across the two pages, in either order", () => {
    const before = Array.from({ length: 48 }, (_, index) => [index + 1, 0] as const);
    const crowded = Array.from({ length: 5 }, (_, index) => [100, index] as const);
    const after = Array.from({ length: 48 }, (_, index) => [index + 200, 0] as const);
    const all = logs([...before, ...crowded, ...after]);

    const oldestFirst = evidencePage(all, { order: "oldest", page: 1 }).logs;
    const oldestSecond = evidencePage(all, { order: "oldest", page: 2 }).logs;
    expect(places(oldestFirst.slice(-2))).toEqual(["100:0", "100:1"]);
    expect(places(oldestSecond.slice(0, 3))).toEqual(["100:2", "100:3", "100:4"]);

    const newestFirst = evidencePage(all, { order: "newest", page: 1 }).logs;
    const newestSecond = evidencePage(all, { order: "newest", page: 2 }).logs;
    expect(places(newestFirst.slice(-2))).toEqual(["100:0", "100:1"]);
    expect(places(newestSecond.slice(0, 3))).toEqual(["100:2", "100:3", "100:4"]);
  });

  it("Dispute Raised opens page 1 in oldest first and closes the last page in newest first", () => {
    const all = oneEach(120);
    expect(evidencePage(all, { order: "oldest", page: 1 }).disputeRaised).toBe("first");
    expect(evidencePage(all, { order: "oldest", page: 3 }).disputeRaised).toBeNull();
    expect(evidencePage(all, { order: "newest", page: 1 }).disputeRaised).toBeNull();
    expect(evidencePage(all, { order: "newest", page: 3 }).disputeRaised).toBe("last");
  });

  it("on one page Dispute Raised is first in oldest first and last in newest first", () => {
    const all = oneEach(3);
    expect(evidencePage(all, { order: "oldest", page: 1 }).disputeRaised).toBe("first");
    expect(evidencePage(all, { order: "newest", page: 1 }).disputeRaised).toBe("last");
  });

  it("no evidence makes one empty page without Dispute Raised", () => {
    expect(evidencePage([], { order: "newest", page: 1 })).toEqual({ page: 1, pageCount: 1, total: 0, start: 0, end: 0, logs: [], disputeRaised: null });
    expect(evidencePage([], { order: "oldest", page: 1 }).disputeRaised).toBeNull();
  });

  it("5,000 entries in one block make 100 pages that keep chain order", () => {
    const all = logs(Array.from({ length: 5_000 }, (_, index) => [7, index] as const));
    const last = evidencePage(all, { order: "newest", page: 100 });
    expect(last).toMatchObject({ page: 100, pageCount: 100, start: 4_950, end: 5_000 });
    expect(last.logs[0]?.logIndex).toBe(4_950);
  });
});
