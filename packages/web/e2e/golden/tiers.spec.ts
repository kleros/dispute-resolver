import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { checkHighlights, evaluateCase, type CheckResult, type FieldResult } from "./compare/engine";
import { recordedCourt } from "./courts";
import { checkLivePeriod, type SubmitControlState } from "./liveChecks";
import { loadLiveTier, type LiveTierEntry } from "./liveTier";
import { caseKey, GOLDEN_CASES, selectedCases, type StableCase } from "./stableTier";
import type { AppealCardSnapshot, CaseSnapshot, EvidenceDisplaySnapshot, EvidenceSnapshot, TimelineColumn } from "./types";

// The cases the golden run takes beyond 04 §2's stable tier: the live tier of 04 §3 (`golden/live.json`), the
// executed disputes a ledger Test clause names (P-01), and the recorded courts the D-39 timeline rule reads. Offline:
// no browser and no network.

function snapshot(app: CaseSnapshot["app"], overrides: Partial<CaseSnapshot> = {}): CaseSnapshot {
  return {
    screen: "case",
    app,
    url: "https://example.invalid/100/cases/1",
    takenAt: 1_000,
    settled: true,
    account: null,
    state: "dispute",
    exists: true,
    arbitrable: "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf",
    family: app === "new" ? "idr-v2" : null,
    compatibility: "full",
    title: "Title",
    question: "Question?",
    descriptionText: "One. Two.",
    rulingOptions: { type: "single-select", titles: ["Yes", "No"], reserved: {}, precision: null },
    period: 4,
    lastPeriodChange: 500,
    timeline: null,
    numberOfVotes: 3,
    courtName: "General Court",
    decision: { kind: "winner", rulingText: "Yes", wonBy: "jury" },
    realityNotice: "none",
    appealPanel: { kind: "withdraw", cards: [], withdrawableWei: "0" },
    evidence: [],
    hiddenEvidenceCount: app === "new" ? 0 : null,
    links: { court: "https://court.kleros.io/cases/1?requiredChainId=100", arbitrableApp: null, metaEvidenceFile: null },
    evidenceDisplay: null,
    metaEvidenceLoaded: true,
    metaEvidenceFailure: null,
    unobservable: {},
    ...overrides,
  };
}

/** Production's timeline (spec 5.7): Evidence, Voting and Appeal only. */
function productionTimeline(period: number): TimelineColumn[] {
  const state = (column: number): TimelineColumn["state"] => {
    if (period > column) return "concluded";
    return period === column ? "current" : "upcoming";
  };
  return [
    { name: "evidence", state: period >= 1 ? "concluded" : "current" },
    { name: "vote", state: period === 1 ? "upcoming" : state(2) },
    { name: "appeal", state: state(3) },
  ];
}

function newTimeline(period: number, withCommit: boolean): TimelineColumn[] {
  const columns: [string, number][] = [
    ["evidence", 0],
    ["commit", 1],
    ["vote", 2],
    ["appeal", 3],
    ["execution", 4],
  ];
  return columns
    .filter(([name]) => withCommit || name !== "commit")
    .map(([name, index]) => {
      if (period > index) return { name, state: "concluded" };
      return { name, state: period === index ? "current" : "upcoming" };
    });
}

function timelineResult(testCase: StableCase | null, period: number, withCommit: boolean): FieldResult {
  const production = snapshot("production", { period, timeline: productionTimeline(period) });
  const next = snapshot("new", { period, timeline: newTimeline(period, withCommit) });
  const result = evaluateCase({ production, next, testCase, newOrigin: "http://localhost:4173" }, null).find((field) => field.field === "timeline");
  if (result === undefined) throw new Error("no timeline result");
  return result;
}

function goldenCase(chainId: number, disputeId: number): StableCase {
  const found = GOLDEN_CASES.find((candidate) => candidate.chainId === chainId && candidate.disputeId === disputeId);
  if (found === undefined) throw new Error(`no golden case ${caseKey(chainId, disputeId)}`);
  return found;
}

const LIVE_ARBITRABLE = "0x2e3b10abf091cdc53cc892a50daba6fdfb4f8a0b";

function livePick(disputeId: number, period: number) {
  return { disputeId, arbitrable: LIVE_ARBITRABLE, period, lastPeriodChange: 1_760_000_000, contributions: period === 3 ? 1 : null, preferredForContributions: period === 3 };
}

/** A `golden/live.json` as `yarn golden-gate live` writes it: Gnosis with 1037 in commit, Sepolia failed. */
function writeLiveFile(): string {
  const file = test.info().outputPath("live.json");
  const live = {
    generatedAt: "2026-10-16T06:00:00.000Z",
    source: "docs/parity/04-golden-cases.md §3",
    chains: [
      {
        status: "ok",
        chainId: 100,
        blockNumber: 42_000_000,
        scanFromBlock: 41_000_000,
        openDisputes: 3,
        unreadableDisputes: [],
        periods: { "0": livePick(1040, 0), "1": livePick(1037, 1), "2": null, "3": livePick(1030, 3) },
      },
      { status: "failed", chainId: 11155111, message: "Chain 11155111 has no read RPC: set REACT_APP_WEB3_SEPOLIA_PROVIDER_URL in .env." },
    ],
  };
  writeFileSync(file, JSON.stringify(live));
  return file;
}

function caseEntries(entries: readonly LiveTierEntry[]) {
  return entries.flatMap((entry) => (entry.kind === "case" ? [entry] : []));
}

test("D-39: a dispute in the commit period must show Commit as its current column", () => {
  expect(timelineResult(null, 1, false).status).toBe("difference");
  expect(timelineResult(null, 1, true)).toMatchObject({ status: "expected-difference", entries: ["D-39"] });
});

test("D-39: an executed case on a hidden-vote court must show a concluded Commit column (Gnosis 0, court 0)", () => {
  expect(recordedCourt(100, 0)).toEqual({ subcourtId: 0, hiddenVotes: true });
  expect(timelineResult(goldenCase(100, 0), 4, false).status).toBe("difference");
  expect(timelineResult(goldenCase(100, 0), 4, true)).toMatchObject({ status: "expected-difference", entries: ["D-39"] });
});

test("D-39: an executed case on a court without hidden votes must not show Commit (mainnet 1454, court 8)", () => {
  expect(timelineResult(goldenCase(1, 1454), 4, true).status).toBe("difference");
  expect(timelineResult(goldenCase(1, 1454), 4, false)).toMatchObject({ status: "expected-difference", entries: ["D-39"] });
});

test("D-39: every golden case has its court recorded, so the Commit column is never optional for it", () => {
  const unrecorded = GOLDEN_CASES.filter((testCase) => recordedCourt(testCase.chainId, testCase.disputeId) === null).map((testCase) =>
    caseKey(testCase.chainId, testCase.disputeId),
  );
  expect(unrecorded).toEqual([]);
});

test("D-39: the live tier takes golden/live.json's pick per chain and period, and says why a pick does not run", () => {
  const file = writeLiveFile();
  const entries = loadLiveTier(file, undefined);

  const cases = caseEntries(entries);
  expect(cases.map((entry) => [entry.key, entry.testCase.chainId, entry.testCase.disputeId, entry.period])).toEqual([
    ["100:0", 100, 1040, 0],
    ["100:1", 100, 1037, 1],
    ["100:3", 100, 1030, 3],
  ]);
  expect(cases[1]?.testCase.arbitrable).toBe(LIVE_ARBITRABLE);
  expect(cases[1]?.block).toBe(42_000_000);
  const skipped = entries.flatMap((entry) => (entry.kind === "skipped" ? [[entry.key, entry.reason]] : []));
  expect(skipped).toEqual([
    ["100:2", expect.stringContaining("no open dispute in the vote period") as unknown],
    ["11155111", expect.stringContaining("Chain 11155111 has no read RPC") as unknown],
  ]);

  expect(caseEntries(loadLiveTier(file, "100:1")).map((entry) => entry.key)).toEqual(["100:1"]);
  // A named pick on a chain whose selection failed stays, so the run reports it instead of running nothing.
  expect(loadLiveTier(file, "11155111:1")).toEqual([{ kind: "skipped", key: "11155111", reason: expect.stringContaining("Chain 11155111 has no read RPC") as unknown }]);
  expect(loadLiveTier(file, "0")).toEqual([]);
  expect(loadLiveTier(test.info().outputPath("missing.json"), undefined)).toEqual([
    { kind: "skipped", key: "live.json", reason: expect.stringContaining("yarn golden-gate live") as unknown },
  ]);
});

/** Kleros Tokens on Curate (Gnosis), the view-only arbitrable of the live appeal pick Gnosis 1037. */
const CURATE_TOKENS = "0xee1502e29795ef6c2d60f8d7120596abe3bad990";

/**
 * A Gnosis `golden/live.json` whose appeal pick is Gnosis 1037 with the family `yarn golden-gate live` recorded for it,
 * and a commit pick from a file written before picks recorded a family.
 */
function writeLiveFileWithFamilies(): string {
  const file = test.info().outputPath("live-families.json");
  const live = {
    generatedAt: "2026-10-16T20:52:24.992Z",
    source: "docs/parity/04-golden-cases.md §3",
    chains: [
      {
        status: "ok",
        chainId: 100,
        blockNumber: 48_792_209,
        scanFromBlock: 47_792_209,
        openDisputes: 4,
        unreadableDisputes: [],
        // `livePick` records no family, as a selection written before families were recorded.
        periods: {
          "0": { ...livePick(1032, 0), family: "idr-v2" },
          "1": livePick(1042, 1),
          "2": null,
          "3": { ...livePick(1037, 3), arbitrable: CURATE_TOKENS, family: "view-only" },
        },
        governorAppeal: null,
      },
    ],
  };
  writeFileSync(file, JSON.stringify(live));
  return file;
}

test("D-47: a live appeal pick whose recorded family is view-only is held to D-47's note, not to production's crowdfunding cards (Gnosis 1037)", () => {
  const [evidence, commit, appeal] = caseEntries(loadLiveTier(writeLiveFileWithFamilies(), undefined));
  expect(evidence?.testCase.highlights).toEqual({ family: "idr-v2" });
  // A file written before picks recorded a family still parses; its picks carry no family highlight.
  expect(commit?.testCase.highlights).toBeUndefined();
  if (appeal === undefined) throw new Error("no appeal pick");
  const { testCase } = appeal;
  expect(testCase).toMatchObject({ chainId: 100, disputeId: 1037, arbitrable: CURATE_TOKENS, highlights: { family: "view-only" } });

  const cards: AppealCardSnapshot[] = [
    { title: "Invalid / Refused to Arbitrate / Tied", code: "0", fundedPercent: 0, remainingWei: "1000", deadline: 2_000 },
    { title: "Yes", code: "1", fundedPercent: 0, remainingWei: "1000", deadline: 2_000 },
    { title: "No", code: "2", fundedPercent: 0, remainingWei: "1000", deadline: 1_500 },
  ];
  const appealPeriod = { period: 3, compatibility: "view-only", arbitrable: CURATE_TOKENS } as const;
  const production = snapshot("production", { ...appealPeriod, timeline: productionTimeline(3), appealPanel: { kind: "crowdfunding", cards, withdrawableWei: null } });
  const note = snapshot("new", {
    ...appealPeriod,
    family: "view-only",
    timeline: newTimeline(3, false),
    appealPanel: { kind: "handled-by-arbitrable", cards: [], withdrawableWei: null },
  });
  const fieldsOf = (next: CaseSnapshot) => evaluateCase({ production, next, testCase, newOrigin: "http://localhost:4173" }, null);
  const fieldOf = (results: readonly FieldResult[], field: string) => results.find((result) => result.field === field);

  const results = fieldsOf(note);
  expect(fieldOf(results, "appealPanel.kind")).toMatchObject({ status: "expected-difference", entries: ["D-47"] });
  expect(fieldOf(results, "appealPanel.cards")).toMatchObject({ status: "expected-difference", entries: ["D-47"] });
  // D-47 replaces production's cards with its note: a view-only pick that still crowdfunds fails.
  const crowdfunding = fieldsOf(snapshot("new", { ...appealPeriod, family: "view-only", timeline: newTimeline(3, false), appealPanel: production.appealPanel }));
  expect(fieldOf(crowdfunding, "appealPanel.kind")?.status).toBe("difference");
  expect(fieldOf(crowdfunding, "appealPanel.cards")?.status).toBe("difference");
  // The new app is held to the recorded family, not to the one it reports about itself.
  const familyCheck = (next: CaseSnapshot) => checkHighlights(testCase, next).find((check) => check.name === "family")?.ok;
  expect(familyCheck(note)).toBe(true);
  expect(familyCheck({ ...note, family: "idr-v2" })).toBe(false);
});

test("D-39: a live hidden-vote dispute in the commit period passes the 04 §3 checks only with Commit current", () => {
  const submit: SubmitControlState = { label: "Submit New Evidence", disabled: false };
  const failed = (checks: readonly CheckResult[]) => checks.filter((check) => check.blocking && !check.ok).map((check) => check.name);
  const commit = (withCommit: boolean) => snapshot("new", { period: 1, timeline: newTimeline(1, withCommit), appealPanel: { kind: "hidden", cards: [], withdrawableWei: null } });

  expect(failed(checkLivePeriod(1, 42_000_000, commit(true), submit))).toEqual([]);
  expect(failed(checkLivePeriod(1, 42_000_000, commit(false), submit))).toEqual(["04 §3, D-39: the timeline's columns and states follow the period"]);
});

test("04 §3: the submit-evidence control is enabled in periods 0 to 3 for a compatible arbitrable, disabled for a view-only one, absent in execution", () => {
  const panel = (period: number) =>
    period >= 3 ? { kind: period === 3 ? "crowdfunding" : "withdraw", cards: [], withdrawableWei: null } : { kind: "hidden", cards: [], withdrawableWei: null };
  const name = "04 §3: the submit-evidence control for the period and the arbitrable's compatibility";
  const result = (period: number, compatibility: "full" | "view-only", submit: SubmitControlState) =>
    checkLivePeriod(period, 1, snapshot("new", { period, compatibility, timeline: newTimeline(period, false), appealPanel: panel(period) }), submit).find(
      (check) => check.name === name,
    )?.ok;

  expect(result(0, "full", { label: "Submit New Evidence", disabled: false })).toBe(true);
  expect(result(2, "view-only", { label: "Go to Arbitrable Application to Submit Evidence", disabled: true })).toBe(true);
  expect(result(2, "view-only", { label: "Submit New Evidence", disabled: false })).toBe(false);
  expect(result(3, "full", { label: null, disabled: null })).toBe(false);
  expect(result(4, "full", { label: null, disabled: null })).toBe(true);
  expect(result(4, "full", { label: "Submit New Evidence", disabled: false })).toBe(false);
});

test("04 §3: the appeal panel exists only in periods 3 and 4", () => {
  const name = "04 §3: the appeal panel exists only in periods 3 and 4";
  const submit: SubmitControlState = { label: "Submit New Evidence", disabled: false };
  const result = (period: number, kind: string) =>
    checkLivePeriod(period, 1, snapshot("new", { period, timeline: newTimeline(period, false), appealPanel: { kind, cards: [], withdrawableWei: null } }), submit).find(
      (check) => check.name === name,
    )?.ok;

  expect(result(2, "hidden")).toBe(true);
  expect(result(2, "crowdfunding")).toBe(false);
  expect(result(3, "crowdfunding")).toBe(true);
  expect(result(3, "hidden")).toBe(false);
});

test("04 §3: in the appeal period every card shows its funding, remaining amount and deadline, the winner's deadline not earlier than the loser's", () => {
  const card = (title: string, code: string, deadline: number | null, fundedPercent: number | null = 10): AppealCardSnapshot => ({
    title,
    code,
    fundedPercent,
    remainingWei: "1000",
    deadline,
  });
  const submit: SubmitControlState = { label: "Submit New Evidence", disabled: false };
  const checksFor = (cards: AppealCardSnapshot[]) =>
    checkLivePeriod(
      3,
      1,
      snapshot("new", {
        period: 3,
        timeline: newTimeline(3, false),
        decision: { kind: "jury-decision", rulingText: "Yes", wonBy: null },
        appealPanel: { kind: "crowdfunding", cards, withdrawableWei: null },
      }),
      submit,
    );
  const failed = (cards: AppealCardSnapshot[]) =>
    checksFor(cards)
      .filter((check) => check.blocking && !check.ok)
      .map((check) => check.name);

  expect(failed([card("Yes", "1", 2_000), card("No", "2", 1_500)])).toEqual([]);
  expect(failed([card("Yes", "1", 1_000), card("No", "2", 1_500)])).toEqual(["04 §3: the winner's deadline is not earlier than any loser's"]);
  expect(failed([card("Yes", "1", 2_000), card("No", "2", null, null)])).toEqual(["04 §3: every crowdfunding card shows its funded percentage, remaining amount and deadline"]);
});

test("P-01: a Sepolia dispute older than 50,000 blocks with evidence runs with the golden cases (Sepolia 365)", () => {
  const [testCase] = selectedCases("11155111:365");
  expect(testCase).toMatchObject({ chainId: 11155111, disputeId: 365, deviations: ["P-01"], highlights: { evidenceCount: 3 } });
  if (testCase?.recordedEvidence === undefined) throw new Error("Sepolia 365 records no evidence scan");
  const { disputeCreatedAt, lastEvidenceAt, block } = testCase.recordedEvidence;
  expect(block - disputeCreatedAt).toBeGreaterThan(50_000);
  expect(block - lastEvidenceAt).toBeGreaterThan(50_000);

  const item = (title: string): EvidenceSnapshot => ({ title, descriptionText: "", submitter: "0xf313d85c7fef79118fcd70498c71bf94e75fc2f6", timestamp: 1, attachmentHref: null });
  const production = snapshot("production", { evidence: [], timeline: productionTimeline(4) });
  const next = snapshot("new", { evidence: [item("a"), item("b"), item("c")], timeline: newTimeline(4, false) });
  const evidence = evaluateCase({ production, next, testCase, newOrigin: "http://localhost:4173" }, null).find((field) => field.field === "evidence");
  expect(evidence).toMatchObject({ status: "expected-difference", entries: ["P-01"] });
  // D-22's count assumes the new list is a part of production's; under P-01 production's is the shorter one.
  const hidden = evaluateCase({ production, next, testCase, newOrigin: "http://localhost:4173" }, null).find((field) => field.field === "hiddenEvidenceCount");
  expect(hidden).toMatchObject({ status: "expected-difference", entries: ["P-01"] });
});

test("06 §5 item 2: mainnet 1255's T2CR display must render the item through the gateway, not only point the frame at it", () => {
  const testCase = goldenCase(1, 1255);
  const display = (documentUrl: string | null, text: string): EvidenceDisplaySnapshot => ({
    present: true,
    srcOrigin: "https://cdn.kleros.link",
    srcPath: "/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html",
    params: {},
    sandbox: ["allow-same-origin", "allow-scripts"],
    rendered: { documentUrl, text },
  });
  const failed = (evidenceDisplay: EvidenceDisplaySnapshot) =>
    checkHighlights(testCase, snapshot("new", { evidenceDisplay }))
      .filter((check) => !check.ok && check.name.startsWith("06 §5 item 2"))
      .map((check) => check.name);
  const expectedText = testCase.highlights?.evidenceDisplayText;
  expect(expectedText).toBeDefined();
  const gatewayDocument = "https://cdn.kleros.link/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html";

  expect(failed(display(gatewayDocument, `Token ${expectedText ?? ""} listed`))).toEqual([]);
  expect(failed(display("chrome-error://chromewebdata/", "This site can't be reached"))).toHaveLength(2);
  expect(failed(display(gatewayDocument, "404 page not found"))).toHaveLength(1);
});
