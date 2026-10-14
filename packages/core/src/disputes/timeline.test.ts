import { describe, expect, it } from "vitest";
import { deriveTimeline } from ".";
import type { Court } from "./types";

/** Gnosis court 19 ("xDai Curation (Hidden Voting)"), as recorded in `__fixtures__/arbitrator-100.json`. */
const HIDDEN_VOTES_COURT: Court = {
  id: 19n,
  parent: 0n,
  hiddenVotes: true,
  timesPerPeriod: [140400n, 291600n, 145800n, 194400n],
  policyUri: "/ipfs/QmbhNThPBeZU6HxW53xDD6kHy4VabuwNmLCCH6Yc9jJbfd",
  name: "xDai Curation (Hidden Voting)",
};
const OPEN_VOTES_COURT: Court = { ...HIDDEN_VOTES_COURT, id: 18n, hiddenVotes: false, timesPerPeriod: [100n, 200n, 300n, 400n], name: "Humanity Court" };
const LAST_CHANGE = 1_700_000_000;

describe("deriveTimeline", () => {
  it("D-39: a hidden-vote court in the commit period shows Evidence concluded, Commit current, and Vote, Appeal, Execution upcoming", () => {
    expect(deriveTimeline({ period: 1, lastPeriodChange: LAST_CHANGE, court: HIDDEN_VOTES_COURT })).toEqual({
      columns: [
        { name: "evidence", state: "concluded" },
        { name: "commit", state: "current", deadline: LAST_CHANGE + 291600 },
        { name: "vote", state: "upcoming", durationSeconds: 145800n },
        { name: "appeal", state: "upcoming", durationSeconds: 194400n },
        { name: "execution", state: "upcoming", durationSeconds: null },
      ],
    });
  });

  it("D-39: a court without hidden votes has no Commit column", () => {
    expect(deriveTimeline({ period: 0, lastPeriodChange: LAST_CHANGE, court: OPEN_VOTES_COURT })).toEqual({
      columns: [
        { name: "evidence", state: "current", deadline: LAST_CHANGE + 100 },
        { name: "vote", state: "upcoming", durationSeconds: 300n },
        { name: "appeal", state: "upcoming", durationSeconds: 400n },
        { name: "execution", state: "upcoming", durationSeconds: null },
      ],
    });
  });

  it("D-39: the execution period concludes every earlier column and is current without a deadline", () => {
    expect(deriveTimeline({ period: 4, lastPeriodChange: LAST_CHANGE, court: HIDDEN_VOTES_COURT })).toEqual({
      columns: [
        { name: "evidence", state: "concluded" },
        { name: "commit", state: "concluded" },
        { name: "vote", state: "concluded" },
        { name: "appeal", state: "concluded" },
        { name: "execution", state: "current", deadline: null },
      ],
    });
  });

  it("§5.7: the current column's deadline is lastPeriodChange + timesPerPeriod[period] (appeal period)", () => {
    const timeline = deriveTimeline({ period: 3, lastPeriodChange: LAST_CHANGE, court: OPEN_VOTES_COURT });
    expect(timeline.columns.find((column) => column.state === "current")).toEqual({ name: "appeal", state: "current", deadline: LAST_CHANGE + 400 });
    expect(timeline.columns.filter((column) => column.state === "concluded").map((column) => column.name)).toEqual(["evidence", "vote"]);
  });

  it("D-39: a dispute in the commit period keeps its Commit column even if its court no longer hides votes", () => {
    const timeline = deriveTimeline({ period: 1, lastPeriodChange: LAST_CHANGE, court: OPEN_VOTES_COURT });
    expect(timeline.columns.map((column) => column.name)).toEqual(["evidence", "commit", "vote", "appeal", "execution"]);
    expect(timeline.columns[1]).toEqual({ name: "commit", state: "current", deadline: LAST_CHANGE + 200 });
  });

  it("D-36: a zero lastPeriodChange is used as read, without a fallback", () => {
    const timeline = deriveTimeline({ period: 0, lastPeriodChange: 0, court: OPEN_VOTES_COURT });
    expect(timeline.columns[0]).toEqual({ name: "evidence", state: "current", deadline: 100 });
  });
});
