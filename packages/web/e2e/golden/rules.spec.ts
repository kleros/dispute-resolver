import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatRuling } from "@dispute-resolver/core";
import { expect, test } from "@playwright/test";
import { checkAccountContext, checkDegradation, checkHighlights, checkSettled, evaluateCase, evaluateOngoing, type FieldResult } from "./compare/engine";
import { REPOSITORY_ROOT } from "./config";
import { blockedResourceOf, reportOnlyViolationOf, summarizeViolations } from "./csp";
import { connectedAccountOf } from "./extract/newCase";
import { displayParams, etherToWei, recordedPageUrl } from "./extract/common";
import { sameAddress, sameWei, timeSign, withoutWhitespace } from "./compare/values";
import { LEDGER, type CaseContext } from "./ledger";
import { redactUrl } from "./redact";
import { buildReports, writeScreenResult } from "./report";
import { caseKey, STABLE_TIER, type StableCase } from "./stableTier";
import type { CaseSnapshot, EvidenceSnapshot, OngoingDisputeSnapshot, OngoingSnapshot } from "./types";

// The comparison rules and the expected-difference table on fixed snapshots, without a browser or the network.

function snapshot(app: CaseSnapshot["app"], overrides: Partial<CaseSnapshot> = {}): CaseSnapshot {
  return {
    screen: "case",
    app,
    url: "https://example.invalid/1/cases/1",
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
    timeline: [
      { name: "evidence", state: "concluded" },
      { name: "vote", state: "concluded" },
      { name: "appeal", state: "concluded" },
    ],
    numberOfVotes: 3,
    courtName: "General Court",
    decision: { kind: "winner", rulingText: "Yes", wonBy: "jury" },
    realityNotice: "none",
    appealPanel: { kind: "withdraw", cards: [], withdrawableWei: "0" },
    evidence: [],
    hiddenEvidenceCount: app === "new" ? 0 : null,
    links: { court: "https://court.kleros.io/cases/1?requiredChainId=1", arbitrableApp: null, metaEvidenceFile: null },
    evidenceDisplay: null,
    metaEvidenceLoaded: true,
    metaEvidenceFailure: null,
    unobservable: {},
    ...overrides,
  };
}

const EXECUTION_TIMELINE = [
  { name: "evidence", state: "concluded" },
  { name: "vote", state: "concluded" },
  { name: "appeal", state: "concluded" },
  { name: "execution", state: "current" },
] as const;

function fieldOf(results: readonly FieldResult[], field: string): FieldResult {
  const result = results.find((candidate) => candidate.field === field);
  if (result === undefined) throw new Error(`no result for ${field}`);
  return result;
}

function evaluate(production: CaseSnapshot, next: CaseSnapshot): FieldResult[] {
  const context: CaseContext = { production, next, testCase: null, newOrigin: "http://localhost:4173" };
  return evaluateCase(context, "the fixture has no contributor");
}

test("04 §1: addresses compare case-insensitively, and production's truncated sender matches its full address", () => {
  expect(sameAddress("0x99489D7bb33539F3D1A401741E56e8f02B9AE0Cf", "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf")).toBe(true);
  expect(sameAddress("0xf313...c2F6", "0xf313d85c7fef79118fcd70498c71bf94e75fc2f6")).toBe(true);
  expect(sameAddress("0xf313...c2F7", "0xf313d85c7fef79118fcd70498c71bf94e75fc2f6")).toBe(false);
});

test("04 §1: amounts compare as wei integers", () => {
  expect(etherToWei("0.0162")).toBe("16200000000000000");
  expect(sameWei("16200000000000000", "0016200000000000000")).toBe(true);
  expect(sameWei("1", "2")).toBe(false);
});

test("04 §1: markdown compares as plain text with all whitespace removed", () => {
  expect(withoutWhitespace("One.\nTwo.")).toBe(withoutWhitespace("One. Two."));
  const results = evaluate(snapshot("production", { descriptionText: "One.Two." }), snapshot("new", { descriptionText: "One.\n\nTwo.", timeline: EXECUTION_TIMELINE }));
  expect(fieldOf(results, "descriptionText").status).toBe("match");
});

test("04 §1: wall-clock time fields compare on presence and sign only", () => {
  expect(timeSign(2_000, 1_000)).toBe("future");
  expect(timeSign(900, 1_000)).toBe("past");
  expect(timeSign(null, 1_000)).toBe("absent");
});

test("04 §1: withdrawable amounts are compared only under the account context", () => {
  const results = evaluate(snapshot("production"), snapshot("new", { appealPanel: { kind: "withdraw", cards: [], withdrawableWei: null }, timeline: EXECUTION_TIMELINE }));
  expect(fieldOf(results, "appealPanel.withdrawableWei").status).toBe("skipped");
});

test("04 §1: a difference no ledger entry explains fails the field", () => {
  const results = evaluate(snapshot("production"), snapshot("new", { courtName: "Blockchain", timeline: EXECUTION_TIMELINE }));
  expect(fieldOf(results, "courtName").status).toBe("difference");
});

test("D-39: the timeline is checked against the columns of production's period, Commit optional only when the court is not recorded", () => {
  expect(fieldOf(evaluate(snapshot("production"), snapshot("new", { timeline: EXECUTION_TIMELINE })), "timeline")).toMatchObject({
    status: "expected-difference",
    entries: ["D-39"],
  });
  const withCommit = [EXECUTION_TIMELINE[0], { name: "commit", state: "concluded" } as const, ...EXECUTION_TIMELINE.slice(1)];
  expect(fieldOf(evaluate(snapshot("production"), snapshot("new", { timeline: withCommit })), "timeline").status).toBe("expected-difference");
  expect(fieldOf(evaluate(snapshot("production"), snapshot("new")), "timeline").status).toBe("difference");
});

test("D-22: the new list is production's without hidden items, and the hidden count accounts for the rest", () => {
  const item = (title: string) => ({ title, descriptionText: "", submitter: "0xf313d85c7fef79118fcd70498c71bf94e75fc2f6", timestamp: 1, attachmentHref: null });
  const production = snapshot("production", { evidence: [item("a"), item("b"), item("c")] });
  const accepted = evaluate(production, snapshot("new", { evidence: [item("a"), item("c")], hiddenEvidenceCount: 1, timeline: EXECUTION_TIMELINE }));
  expect(fieldOf(accepted, "evidence")).toMatchObject({ status: "expected-difference", entries: ["D-22"] });
  const rejected = evaluate(production, snapshot("new", { evidence: [item("a"), item("c")], hiddenEvidenceCount: 0, timeline: EXECUTION_TIMELINE }));
  expect(fieldOf(rejected, "evidence").status).toBe("difference");
});

test("D-26: an attachment moved to the configured gateway compares on its /ipfs/<CID> path", () => {
  const item = (href: string) => ({ title: "t", descriptionText: "", submitter: "0xf313d85c7fef79118fcd70498c71bf94e75fc2f6", timestamp: 1, attachmentHref: href });
  const results = evaluate(
    snapshot("production", { evidence: [item("https://ipfs.kleros.io/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html")] }),
    snapshot("new", { evidence: [item("https://cdn.kleros.link/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html")], timeline: EXECUTION_TIMELINE }),
  );
  expect(fieldOf(results, "evidence")).toMatchObject({ status: "expected-difference", entries: ["D-26"] });
});

function arbitrableAppLink(production: string | null, next: string | null): FieldResult {
  const links = (arbitrableApp: string | null) => ({ court: "https://court.kleros.io/cases/1?requiredChainId=1", arbitrableApp, metaEvidenceFile: null });
  return fieldOf(evaluate(snapshot("production", { links: links(production) }), snapshot("new", { links: links(next), timeline: EXECUTION_TIMELINE })), "links.arbitrableApp");
}

test("D-28: a link to the app's host name is hidden whatever its port, as core's host rule compares host names", () => {
  expect(arbitrableAppLink("https://localhost:5173/1/cases/1", null)).toMatchObject({ status: "expected-difference", entries: ["D-28"] });
  expect(arbitrableAppLink("https://LOCALHOST/1/cases/1", null)).toMatchObject({ status: "expected-difference", entries: ["D-28"] });
  expect(arbitrableAppLink("https://example.com/1/cases/1", null).status).toBe("difference");
});

test("D-28: a link production hid only because resolve.kleros.io appears outside its host is the new app's to show", () => {
  expect(arbitrableAppLink(null, "https://example.com/?via=resolve.kleros.io")).toMatchObject({ status: "expected-difference", entries: ["D-28"] });
  expect(arbitrableAppLink(null, "https://resolve.kleros.io.example.com/")).toMatchObject({ status: "expected-difference", entries: ["D-28"] });
  expect(arbitrableAppLink(null, "https://example.com/").status).toBe("difference");
  expect(arbitrableAppLink(null, "https://localhost:5173/?via=resolve.kleros.io").status).toBe("difference");
});

/** A synthetic API key, never a real one: the redaction tests look for it in what is written. */
const RPC_KEY = "0123456789abcdef0123456789abcdef";
const KEYED_RPC_URL = `https://mainnet.example.invalid/v3/${RPC_KEY}`;

function displayQuery(params: Readonly<Record<string, string>>): string {
  return `?${encodeURIComponent(JSON.stringify(params))}`;
}

test("D-35: an RPC URL in the display parameters is stored as its host and a fingerprint of the whole URL", () => {
  const params = displayParams(displayQuery({ jsonRpcUrl: KEYED_RPC_URL, disputeID: "1" }));
  expect(params.disputeID).toBe("1");
  expect(params.jsonRpcUrl).toMatch(/^mainnet\.example\.invalid sha256:[\da-f]{12}$/);
  expect(JSON.stringify(params).includes(RPC_KEY)).toBe(false);
  // Equal URLs keep equal values and different keys do not, so the comparison still sees the endpoint.
  expect(displayParams(displayQuery({ jsonRpcUrl: KEYED_RPC_URL })).jsonRpcUrl).toBe(params.jsonRpcUrl);
  expect(displayParams(displayQuery({ jsonRpcUrl: `${KEYED_RPC_URL}0` })).jsonRpcUrl).not.toBe(params.jsonRpcUrl);
  // A URL in any other parameter, and an RPC value that is no URL, are redacted too.
  const other = displayParams(displayQuery({ arbitrableJsonRpcUrl: `mainnet.example.invalid/v3/${RPC_KEY}`, callback: `see ${KEYED_RPC_URL}` }));
  expect(other.arbitrableJsonRpcUrl).toMatch(/^not-a-url sha256:[\da-f]{12}$/);
  expect(other.callback).toMatch(/^see mainnet\.example\.invalid sha256:[\da-f]{12}$/);
  expect(redactUrl(params.jsonRpcUrl ?? "")).toBe(params.jsonRpcUrl);
});

test("D-35: a report built from a snapshot holding a keyed RPC URL writes neither the key nor the URL", () => {
  const display = (jsonRpcUrl: string) =>
    ({
      present: true,
      srcOrigin: "https://cdn.kleros.link",
      srcPath: "/ipfs/QmDisplay/index.html",
      params: { jsonRpcUrl, disputeID: "1" },
      sandbox: ["allow-scripts"],
      rendered: { documentUrl: null, text: "" },
    }) as const;
  const production = snapshot("production", { evidenceDisplay: display(KEYED_RPC_URL) });
  const next = snapshot("new", { evidenceDisplay: display(`https://other.example.invalid/v2/${RPC_KEY}`), timeline: EXECUTION_TIMELINE });
  const fields = evaluate(production, next);
  const directories = { cases: test.info().outputPath("cases"), reports: test.info().outputPath("reports") };
  writeScreenResult(
    {
      id: "case 1:1",
      screen: "case",
      chainId: 1,
      disputeId: 1,
      description: "a keyed RPC URL",
      account: null,
      accountNote: null,
      passed: true,
      attempt: 1,
      fields,
      checks: [],
      snapshots: { production, next },
      cspViolations: [],
    },
    directories,
  );
  expect(buildReports(directories)).toEqual({ total: 1, failed: 0, cspViolations: 0 });
  const written = [join(directories.cases, "case-1-1.json"), join(directories.reports, "golden-report.json"), join(directories.reports, "golden-report.md")].map((file) =>
    readFileSync(file, "utf8"),
  );
  for (const text of written) {
    expect(text.includes(RPC_KEY), "the key is written").toBe(false);
    expect(text.includes(KEYED_RPC_URL), "the full URL is written").toBe(false);
  }
  expect(written[1]?.includes("mainnet.example.invalid sha256:")).toBe(true);
});

test("C2: a report-only violation is recorded as its directive and the blocked origin, never a path or query", () => {
  const app = "https://preview.example.invalid";
  const raw = { disposition: "report", effectiveDirective: "connect-src", blockedURI: `${KEYED_RPC_URL}?key=${RPC_KEY}`, frameUrl: `${app}/1/cases/1454` };

  expect(reportOnlyViolationOf(raw, app)).toEqual({ directive: "connect-src", blocked: "https://mainnet.example.invalid" });
  expect(blockedResourceOf(`wss://relay.example.invalid/socket/${RPC_KEY}`)).toBe("wss://relay.example.invalid");
  expect(blockedResourceOf("inline")).toBe("inline");
  expect(blockedResourceOf("eval")).toBe("eval");
  expect(blockedResourceOf("data:image/png;base64,AAAA")).toBe("data:");
  expect(blockedResourceOf(`mainnet.example.invalid/v3/${RPC_KEY}`)).toBe("unparseable");
  // The runner's enforced policy (C3) and a third-party frame's own policy are not the app's report-only policy.
  expect(reportOnlyViolationOf({ ...raw, disposition: "enforce" }, app)).toBeNull();
  expect(reportOnlyViolationOf({ ...raw, frameUrl: "https://cdn.example.invalid/ipfs/QmDisplay/index.html" }, app)).toBeNull();
});

test("C2: the report lists each screen's report-only violations and the run's total, without any key", () => {
  const app = "https://preview.example.invalid";
  const violation = (blockedURI: string) => reportOnlyViolationOf({ disposition: "report", effectiveDirective: "connect-src", blockedURI, frameUrl: `${app}/1/ongoing` }, app);
  const hits = [violation(KEYED_RPC_URL), violation(`${KEYED_RPC_URL}/again`), violation("https://court-policy.example.invalid/policy.json")].filter((hit) => hit !== null);
  const cspViolations = summarizeViolations(hits);
  expect(cspViolations).toEqual([
    { directive: "connect-src", blocked: "https://court-policy.example.invalid", count: 1 },
    { directive: "connect-src", blocked: "https://mainnet.example.invalid", count: 2 },
  ]);
  const production = snapshot("production");
  const next = snapshot("new");
  const directories = { cases: test.info().outputPath("cases"), reports: test.info().outputPath("reports") };
  writeScreenResult(
    {
      id: "case 1:1",
      screen: "case",
      chainId: 1,
      disputeId: 1,
      description: "report-only violations",
      account: null,
      accountNote: null,
      passed: true,
      attempt: 1,
      fields: evaluate(production, next),
      checks: [],
      snapshots: { production, next },
      cspViolations,
    },
    directories,
  );

  expect(buildReports(directories)).toEqual({ total: 1, failed: 0, cspViolations: 3 });
  const markdown = readFileSync(join(directories.reports, "golden-report.md"), "utf8");
  expect(markdown).toContain("## Report-only CSP violations (C2)");
  expect(markdown).toContain("| connect-src | https://mainnet.example.invalid | 2 | case 1:1 |");
  const json = readFileSync(join(directories.reports, "golden-report.json"), "utf8");
  expect((JSON.parse(json) as { cspViolations: number }).cspViolations).toBe(3);
  for (const text of [markdown, json]) expect(text.includes(RPC_KEY), "the key is written").toBe(false);
});

test("a page URL is recorded as the app's origin and the screen path, without the base URL's credentials, path or query", () => {
  const credential = "user:0123456789abcdef";
  const recorded = recordedPageUrl(`https://${credential}@preview.example.invalid/${RPC_KEY}?token=${RPC_KEY}#evidence`, "1/cases/1454");
  expect(recorded).toBe("https://preview.example.invalid/1/cases/1454");
  expect(recorded.includes(credential)).toBe(false);
  expect(recorded.includes(RPC_KEY)).toBe(false);
  expect(recordedPageUrl("http://localhost:4173", "100/ongoing")).toBe("http://localhost:4173/100/ongoing");
});

/** The proposal IDs of docs/ledger-proposals.md, in document order, from the `**P-nn ·` headings of its entries. */
function recordedProposalIds(): string[] {
  const text = readFileSync(join(REPOSITORY_ROOT, "docs", "ledger-proposals.md"), "utf8");
  return Array.from(text.matchAll(/^\*\*(P-\d{2}) /gm), (match) => match[1] ?? "");
}

test("the table holds every ledger entry D-01 to D-56 and every proposal of docs/ledger-proposals.md, once each", () => {
  const deviations = Array.from({ length: 56 }, (_, index) => `D-${String(index + 1).padStart(2, "0")}`);
  const proposals = recordedProposalIds();
  expect(proposals.length, "no proposal heading was found in docs/ledger-proposals.md").toBeGreaterThan(0);
  expect(LEDGER.map((entry) => entry.id)).toEqual([...deviations, ...proposals]);
  for (const entry of LEDGER) expect(entry.rules.length === 0 || entry.fields.length > 0, `${entry.id} has rules but names no field`).toBe(true);
});

const EXAMPLE_SUBMITTER = "0xf313d85c7fef79118fcd70498c71bf94e75fc2f6";

function stableCase(chainId: number, disputeId: number): StableCase {
  const found = STABLE_TIER.find((candidate) => candidate.chainId === chainId && candidate.disputeId === disputeId);
  if (found === undefined) throw new Error(`no stable case ${caseKey(chainId, disputeId)}`);
  return found;
}

function evaluateFor(testCase: StableCase | null, production: CaseSnapshot, next: CaseSnapshot): FieldResult[] {
  return evaluateCase({ production, next, testCase, newOrigin: "http://localhost:4173" }, null);
}

function withdrawPanel(withdrawableWei: string | null): CaseSnapshot["appealPanel"] {
  return { kind: "withdraw", cards: [], withdrawableWei };
}

test("D-22: the items the new app still shows are compared with their production counterparts", () => {
  const item = (title: string, overrides: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot => ({
    title,
    descriptionText: "",
    submitter: EXAMPLE_SUBMITTER,
    timestamp: 1_000,
    attachmentHref: `https://cdn.kleros.link/ipfs/Qm${title}/file.pdf`,
    ...overrides,
  });
  const production = snapshot("production", { evidence: [item("a"), item("b"), item("c")] });
  const next = snapshot("new", {
    evidence: [
      item("a", { submitter: "0x00000000000000000000000000000000000000b0" }),
      item("c", { timestamp: 4_600, attachmentHref: "https://cdn.kleros.link/ipfs/QmOther/file.pdf" }),
    ],
    hiddenEvidenceCount: 1,
    timeline: EXECUTION_TIMELINE,
  });
  const evidence = fieldOf(evaluate(production, next), "evidence");
  expect(evidence.status).toBe("difference");
  expect(evidence.unexplained.map((mismatch) => mismatch.path).sort((a, b) => a.localeCompare(b))).toEqual([
    "evidence[0].submitter",
    "evidence[2].attachmentHref",
    "evidence[2].timestamp",
  ]);
});

test("D-02: on the cases it names, the withdrawable amount is the recorded on-chain sum, not any amount above production's", () => {
  const testCase = stableCase(100, 132);
  const record = testCase.accountContext;
  if (record === undefined) throw new Error("Gnosis 132 has no recorded account context");
  const production = snapshot("production", { account: record.account, appealPanel: withdrawPanel(record.withdrawableWei) });
  const at = (withdrawableWei: string) => snapshot("new", { account: record.account, appealPanel: withdrawPanel(withdrawableWei), timeline: EXECUTION_TIMELINE });
  expect(fieldOf(evaluateFor(testCase, production, at((BigInt(record.withdrawableWei) * 2n).toString())), "appealPanel.withdrawableWei").status).toBe("difference");
  expect(fieldOf(evaluateFor(testCase, production, at(record.withdrawableWei)), "appealPanel.withdrawableWei")).toMatchObject({ status: "match", entries: ["D-02"] });
});

test("D-02: Gnosis 220 shows the refund production's unanchored head − 1,000,000 window missed", () => {
  const testCase = stableCase(100, 220);
  const record = testCase.accountContext;
  if (record === undefined) throw new Error("Gnosis 220 has no recorded account context");
  expect(record.withdrawableWei).toBe(etherToWei("1"));
  const production = snapshot("production", { account: record.account, appealPanel: withdrawPanel("0") });
  const at = (withdrawableWei: string) => snapshot("new", { account: record.account, appealPanel: withdrawPanel(withdrawableWei), timeline: EXECUTION_TIMELINE });
  expect(fieldOf(evaluateFor(testCase, production, at(record.withdrawableWei)), "appealPanel.withdrawableWei")).toMatchObject({
    status: "expected-difference",
    entries: ["D-02"],
  });
  expect(fieldOf(evaluateFor(testCase, production, at("0")), "appealPanel.withdrawableWei").status).toBe("difference");
});

test("D-02, D-51: no rule accepts a higher withdrawable amount on a case neither entry names", () => {
  const account = "0x9b29085866dae2ac0611be9c5191101ceb2c6d53";
  const production = snapshot("production", { account, appealPanel: withdrawPanel("0") });
  const next = snapshot("new", { account, appealPanel: withdrawPanel("89600000000000000000"), timeline: EXECUTION_TIMELINE });
  for (const testCase of [null, stableCase(1, 1454)]) {
    expect(fieldOf(evaluateFor(testCase, production, next), "appealPanel.withdrawableWei").status).toBe("difference");
  }
});

test("D-30: a case whose ledger test needs the account context fails when the new app did not apply the account", () => {
  const testCase = stableCase(1, 1678);
  const account = "0x9b29085866dae2ac0611be9c5191101ceb2c6d53";
  const production = snapshot("production", { account, appealPanel: withdrawPanel("0") });
  const next = snapshot("new", {
    account: null,
    appealPanel: withdrawPanel("0"),
    timeline: EXECUTION_TIMELINE,
    unobservable: { "appealPanel.withdrawableWei": "the new app did not connect the harness account" },
  });
  expect(fieldOf(evaluateFor(testCase, production, next), "appealPanel.withdrawableWei").status).toBe("difference");
});

test("D-46: the new app's own idr-legacy label does not switch the legacy panel on", () => {
  const production = snapshot("production", { appealPanel: withdrawPanel("0") });
  const next = snapshot("new", { family: "idr-legacy", appealPanel: { kind: "withdraw-unsupported", cards: [], withdrawableWei: null }, timeline: EXECUTION_TIMELINE });
  expect(fieldOf(evaluateFor(stableCase(1, 1454), production, next), "appealPanel.kind").status).toBe("difference");
  expect(fieldOf(evaluateFor(stableCase(1, 505), production, next), "appealPanel.kind")).toMatchObject({ status: "expected-difference", entries: ["D-46"] });
});

test("D-47: the new app's own view-only label does not switch the D-47 panel on", () => {
  const production = snapshot("production", { appealPanel: withdrawPanel("0") });
  const next = snapshot("new", { family: "view-only", appealPanel: { kind: "hidden", cards: [], withdrawableWei: null }, timeline: EXECUTION_TIMELINE });
  expect(fieldOf(evaluateFor(stableCase(1, 1454), production, next), "appealPanel.kind").status).toBe("difference");
  expect(fieldOf(evaluateFor(stableCase(1, 1674), production, next), "appealPanel.kind")).toMatchObject({ status: "expected-difference", entries: ["D-47"] });
});

test("D-47: a per-case D-47 tag applies the view-only panel rules (Gnosis 41, 42, 44, 140, 863)", () => {
  const production = snapshot("production", { appealPanel: withdrawPanel("0") });
  const next = snapshot("new", { family: "view-only", appealPanel: { kind: "hidden", cards: [], withdrawableWei: null }, timeline: EXECUTION_TIMELINE });
  for (const disputeId of [41, 42, 44, 140, 863]) {
    const results = evaluateFor(stableCase(100, disputeId), production, next);
    expect(fieldOf(results, "appealPanel.kind"), `Gnosis ${disputeId.toString()}`).toMatchObject({ status: "expected-difference", entries: ["D-47"] });
    expect(fieldOf(results, "appealPanel.withdrawableWei"), `Gnosis ${disputeId.toString()}`).toMatchObject({ entries: ["D-47"] });
  }
  const shown = snapshot("new", { family: "view-only", appealPanel: withdrawPanel("0"), timeline: EXECUTION_TIMELINE });
  expect(fieldOf(evaluateFor(stableCase(100, 41), production, shown), "appealPanel.kind").status).toBe("difference");
  expect(fieldOf(evaluateFor(stableCase(1, 1454), production, next), "appealPanel.kind").status).toBe("difference");
});

test("D-47: a live appeal pick with no recorded family on which production shows its view-only banner and the fees notice shows the note (mainnet 1684)", () => {
  // As liveTier.ts builds a pick of a golden/live.json that records no family: a test case without 04 §2 highlights.
  const livePick: StableCase = { chainId: 1, disputeId: 1684, arbitrable: "0x799cb978dea5d6ca00ccb1794d3c3d4c89e40cd1", exercises: "live tier: the appeal pick (04 §3)" };
  const appealPeriod = { period: 3, compatibility: "view-only" } as const;
  const feesUnavailable = snapshot("production", { ...appealPeriod, appealPanel: { kind: "fees-unavailable", cards: [], withdrawableWei: null } });
  const note = snapshot("new", { ...appealPeriod, family: "view-only", appealPanel: { kind: "handled-by-arbitrable", cards: [], withdrawableWei: null } });
  const card = { title: "Yes", code: "1", fundedPercent: 0, remainingWei: "1000", deadline: 2_000 };
  const crowdfunding = snapshot("new", { ...appealPeriod, family: "view-only", appealPanel: { kind: "crowdfunding", cards: [card], withdrawableWei: null } });

  expect(fieldOf(evaluateFor(livePick, feesUnavailable, note), "appealPanel.kind")).toMatchObject({ status: "expected-difference", entries: ["D-47"] });
  expect(fieldOf(evaluateFor(livePick, feesUnavailable, crowdfunding), "appealPanel.kind").status).toBe("difference");
  expect(fieldOf(evaluateFor(livePick, feesUnavailable, crowdfunding), "appealPanel.cards").status).toBe("difference");
  // A recorded family decides instead of production's fields.
  const governorPick: StableCase = { ...livePick, highlights: { family: "governor" } };
  expect(fieldOf(evaluateFor(governorPick, feesUnavailable, note), "appealPanel.kind").status).toBe("difference");
  // Production's banner alone does not: the governors show it too (mainnet 1672, 535), and they crowdfund.
  const productionCards = snapshot("production", { ...appealPeriod, appealPanel: { kind: "crowdfunding", cards: [card], withdrawableWei: null } });
  expect(fieldOf(evaluateFor(livePick, productionCards, note), "appealPanel.kind").status).toBe("difference");
  // Execution is left out: production's withdraw body does not tell a view-only arbitrable from a governor.
  const execution = { period: 4, compatibility: "view-only", timeline: EXECUTION_TIMELINE } as const;
  const hidden = snapshot("new", { ...execution, family: "view-only", appealPanel: { kind: "hidden", cards: [], withdrawableWei: null } });
  expect(fieldOf(evaluateFor(livePick, snapshot("production", { ...execution, appealPanel: withdrawPanel("0") }), hidden), "appealPanel.kind").status).toBe("difference");
});

/** Mainnet 1658's decision in both apps: production formats the current ruling, the new app the one funded ruling. */
function decision1658(rulingText: string, wonBy: "default" | "jury") {
  return { kind: "winner", rulingText, wonBy } as const;
}

test("D-02: mainnet 1658 shows the single funded ruling production's window missed, won by default", () => {
  const testCase = stableCase(1, 1658);
  const options = { type: "uint", titles: [], reserved: {}, precision: 18 } as const;
  const production = snapshot("production", { rulingOptions: { ...options, precision: null }, decision: decision1658("0.000000004243172404", "jury") });
  const at = (rulingText: string, wonBy: "default" | "jury") =>
    snapshot("new", { family: "reality-proxy", rulingOptions: options, decision: decision1658(rulingText, wonBy), timeline: EXECUTION_TIMELINE });
  const funded = evaluateFor(testCase, production, at("4243172404", "default"));
  expect(fieldOf(funded, "decision.wonBy")).toMatchObject({ status: "expected-difference", entries: ["D-02"] });
  expect(fieldOf(funded, "decision.rulingText")).toMatchObject({ status: "expected-difference", entries: ["D-02"] });

  expect(fieldOf(evaluateFor(testCase, production, at("4243172405", "default")), "decision.rulingText").status).toBe("difference");
  expect(fieldOf(evaluateFor(testCase, production, at("4243172404", "jury")), "decision.rulingText").status).toBe("difference");
  const otherProduction = snapshot("production", { ...production, decision: decision1658("4243172404", "jury") });
  expect(fieldOf(evaluateFor(testCase, otherProduction, at("0.000000004243172404", "default")), "decision.rulingText").status).toBe("difference");
  expect(fieldOf(evaluateFor(stableCase(1, 1454), production, at("4243172404", "default")), "decision.rulingText").status).toBe("difference");
});

test("P-07: a gateway path is content-addressed by core's rule on the path as written, not by the parsed URL", () => {
  const links = (metaEvidenceFile: string | null) => ({ court: "https://court.kleros.io/cases/1?requiredChainId=1", arbitrableApp: null, metaEvidenceFile });
  const metaEvidenceFile = (before: string) =>
    fieldOf(
      evaluateFor(stableCase(100, 431), snapshot("production", { links: links(before) }), snapshot("new", { links: links(null), timeline: EXECUTION_TIMELINE })),
      "links.metaEvidenceFile",
    );
  // The first segment is no CID, and a tab, which URL parsing strips, sits in a later one: core rejects both paths.
  expect(metaEvidenceFile("https://ipfs.kleros.io/ipfs/QmNotACid/policy.pdf")).toMatchObject({ status: "expected-difference", entries: ["P-07"] });
  expect(metaEvidenceFile("https://cdn.kleros.link/ipfs/QmWuXCDoL6Vks4WtPu9y18wqmrq2JMNmL6JZUStunQjQmc/a\tb.pdf")).toMatchObject({
    status: "expected-difference",
    entries: ["P-07"],
  });
  // A relative value is judged the same way: a content-addressed path production linked must stay linked.
  expect(metaEvidenceFile("/ipfs/QmWuXCDoL6Vks4WtPu9y18wqmrq2JMNmL6JZUStunQjQmc/policy.pdf").status).toBe("difference");
  expect(metaEvidenceFile("ipfs.kleros.io/ipfs/QmNotACid/policy.pdf")).toMatchObject({ status: "expected-difference", entries: ["P-07"] });
  // A newline is a C0 control core rejects, wherever it sits in the path.
  expect(metaEvidenceFile("https://cdn.kleros.link/ipfs/QmWuXCDoL6Vks4WtPu9y18wqmrq2JMNmL6JZUStunQjQmc/a\nb.pdf")).toMatchObject({
    status: "expected-difference",
    entries: ["P-07"],
  });
  // Gnosis 431's policy file name carries C1 characters, which core accepts: dropping its link is no P-07 change.
  expect(
    metaEvidenceFile("https://cdn.kleros.link/ipfs/QmWuXCDoL6Vks4WtPu9y18wqmrq2JMNmL6JZUStunQjQmc/Poli\u00cc\u0081tica de Interpretacio\u00cc\u0081n de Disputas Lemon.pdf").status,
  ).toBe("difference");

  const item = (attachmentHref: string | null): EvidenceSnapshot => ({ title: "t", descriptionText: "", submitter: EXAMPLE_SUBMITTER, timestamp: 1, attachmentHref });
  const evidence = evaluateFor(
    stableCase(100, 431),
    snapshot("production", { evidence: [item("https://ipfs.kleros.io/ipfs/QmNotACid/evidence.pdf")] }),
    snapshot("new", { evidence: [item(null)], timeline: EXECUTION_TIMELINE }),
  );
  expect(fieldOf(evidence, "evidence")).toMatchObject({ status: "expected-difference", entries: ["P-07"] });
});

test("04 §2: every row that names a family carries it as a highlight the new app is checked against", () => {
  const named: Readonly<Record<string, string>> = {
    "1:505": "idr-legacy",
    "1:328": "idr-legacy",
    "1:912": "idr-v1",
    "1:913": "idr-v1",
    "1:1674": "view-only",
    "1:1667": "view-only",
    "1:1646": "view-only",
    "1:1255": "view-only",
    "1:1659": "view-only",
    "1:1649": "view-only",
    "1:1100": "view-only",
    "1:1621": "governor",
    "1:1676": "governor",
    "1:1672": "governor",
    "1:535": "governor",
    "1:878": "escrow-v1",
    "1:168": "escrow-v1",
    "1:92": "escrow-v1",
    "1:1678": "idr-v1",
    "1:1226": "idr-v1",
    "1:560": "view-only",
    "100:0": "idr-v1",
    "100:1022": "view-only",
    "100:115": "governor",
  };
  const highlighted = Object.fromEntries(
    STABLE_TIER.flatMap((testCase) => (testCase.highlights?.family === undefined ? [] : [[caseKey(testCase.chainId, testCase.disputeId), testCase.highlights.family]])),
  );
  expect(highlighted).toEqual(named);
});

function ongoing(app: OngoingSnapshot["app"], disputes: readonly OngoingDisputeSnapshot[], takenAt: number): OngoingSnapshot {
  return { screen: "ongoing", app, url: "https://example.invalid/1/ongoing", takenAt, settled: true, unobservable: {}, chain: 1, state: "list", disputes };
}

function ongoingCard(overrides: Partial<OngoingDisputeSnapshot> = {}): OngoingDisputeSnapshot {
  return { id: "7", title: "Title", courtName: "General Court", period: 0, countdownPresent: true, periodEndsAt: null, ...overrides };
}

test("04 §1: an Ongoing period difference fails unless production's countdown shows the period could have ended", () => {
  const production = ongoing("production", [ongoingCard({ periodEndsAt: 1_000 + 5 * 86_400 })], 1_000);
  const wrong = ongoing("new", [ongoingCard({ period: 2, courtName: "Blockchain" })], 1_300);
  const result = fieldOf(evaluateOngoing({ production, next: wrong }), "disputes");
  expect(result.status).toBe("difference");
  expect(result.unexplained.map((mismatch) => mismatch.key)).toEqual(["disputes[].period", "disputes[].courtName"]);

  const ended = ongoing("production", [ongoingCard({ periodEndsAt: 1_200 })], 1_000);
  expect(fieldOf(evaluateOngoing({ production: ended, next: ongoing("new", [ongoingCard({ period: 2, countdownPresent: false })], 1_300) }), "disputes").status).toBe("match");
  const backwards = ongoing("new", [ongoingCard({ period: 0 })], 1_300);
  const later = ongoing("production", [ongoingCard({ period: 2, periodEndsAt: 1_200 })], 1_000);
  expect(fieldOf(evaluateOngoing({ production: later, next: backwards }), "disputes").status).toBe("difference");
});

test("D-05: a production title two disputes share is accepted where the new app gives one its own title; a swap is not", () => {
  const card = (id: string, title: string) => ongoingCard({ id, title, periodEndsAt: 1_000 + 86_400 });
  const production = ongoing("production", [card("1", "Add item A?"), card("2", "Add item B?")], 1_000);
  const swapped = ongoing("new", [card("1", "Add item B?"), card("2", "Add item A?")], 1_100);
  expect(fieldOf(evaluateOngoing({ production, next: swapped }), "disputes").status).toBe("difference");

  const crossResolved = ongoing("production", [card("1", "Add item B?"), card("2", "Add item B?")], 1_000);
  const own = ongoing("new", [card("1", "Add item A?"), card("2", "Add item B?")], 1_100);
  expect(fieldOf(evaluateOngoing({ production: crossResolved, next: own }), "disputes")).toMatchObject({ status: "expected-difference", entries: ["D-05"] });
  const bothChanged = ongoing("new", [card("1", "Add item A?"), card("2", "Add item C?")], 1_100);
  expect(fieldOf(evaluateOngoing({ production: crossResolved, next: bothChanged }), "disputes").status).toBe("difference");
});

test("P-05: a governor tie accepts the uniform shared-amount change and the later deadline only", () => {
  const testCase = stableCase(1, 1621);
  const tie = { kind: "jury-decision", rulingText: "invalid / refused to arbitrate / tied", wonBy: null } as const;
  const card = (code: string, fundedPercent: number, remainingWei: string, deadline: number) => ({ title: `List ${code}`, code, fundedPercent, remainingWei, deadline });
  const production = snapshot("production", {
    period: 3,
    decision: tie,
    appealPanel: { kind: "crowdfunding", cards: [card("1", 50, "1500", 900), card("2", 0, "3000", 900)], withdrawableWei: null },
  });
  const panel = (cards: CaseSnapshot["appealPanel"]["cards"]) =>
    snapshot("new", { family: "governor", period: 3, decision: tie, appealPanel: { kind: "crowdfunding", cards, withdrawableWei: null } });
  const broken = panel([card("1", 100, "0", 1_500), card("2", 0, "2000", 1_500)]);
  expect(fieldOf(evaluateFor(testCase, production, broken), "appealPanel.cards").status).toBe("difference");
  const earlier = snapshot("production", { ...production, appealPanel: { ...production.appealPanel, cards: [card("1", 50, "1500", 1_500), card("2", 0, "3000", 1_500)] } });
  expect(fieldOf(evaluateFor(testCase, earlier, panel([card("1", 75, "500", 900), card("2", 0, "2000", 900)])), "appealPanel.cards").status).toBe("difference");
  const shared = panel([card("1", 75, "500", 1_500), card("2", 0, "2000", 1_500)]);
  expect(fieldOf(evaluateFor(testCase, production, shared), "appealPanel.cards")).toMatchObject({ status: "expected-difference", entries: ["P-05"] });
});

test("D-36: a degraded meta-evidence section shows its failed state with a reason; rendering nothing fails", () => {
  const testCase = stableCase(1, 150);
  const absent = { title: null, question: null, descriptionText: null, rulingOptions: null, metaEvidenceLoaded: false } as const;
  const production = snapshot("production", { ...absent, timeline: null });
  const silent = snapshot("new", { ...absent, timeline: EXECUTION_TIMELINE });
  const failedChecks = (next: CaseSnapshot) => checkDegradation(testCase, production, next).filter((check) => check.blocking && !check.ok);
  expect(failedChecks(silent).map((check) => check.name)).toEqual(["the meta-evidence section loaded, or shows its failed state with a reason (D-36)"]);
  expect(fieldOf(evaluateFor(testCase, production, silent), "title").status).toBe("difference");

  const degraded = snapshot("new", { ...absent, timeline: EXECUTION_TIMELINE, metaEvidenceFailure: "The meta-evidence file could not be fetched." });
  expect(failedChecks(degraded)).toEqual([]);
  expect(fieldOf(evaluateFor(testCase, production, degraded), "title").status).toBe("match");
});

test("04 §1 account context: a case whose ledger test reads the amount fails unless both apps used the recorded account", () => {
  const testCase = stableCase(1, 1678);
  const record = testCase.accountContext;
  if (record === undefined) throw new Error("mainnet 1678 has no recorded account context");
  const failed = (production: CaseSnapshot, next: CaseSnapshot) => checkAccountContext(testCase, production, next, record.account).filter((check) => check.blocking && !check.ok);
  const production = snapshot("production", { account: record.account });
  expect(failed(production, snapshot("new", { account: null }))).toHaveLength(1);
  expect(failed(snapshot("production"), snapshot("new"))).toHaveLength(2);
  expect(failed(production, snapshot("new", { account: record.account }))).toEqual([]);
  const other = checkAccountContext(stableCase(1, 1658), production, snapshot("new", { account: null }), "0x2ff064d951996c9fe70d6ba22d8684f37b2e24ec");
  expect(other.map((check) => [check.ok, check.blocking])).toEqual([[false, false]]);
});

test("04 §1 account context: the new app's account is read from its header, not assumed", async ({ page }) => {
  const intended = "0x9b29085866dae2ac0611be9c5191101ceb2c6d53";
  await page.setContent('<header><button aria-label="Account 0x9B29…6D53">0x9B29…6D53</button></header>');
  expect(await connectedAccountOf(page, intended, 1_000)).toEqual({ account: intended, reason: null });
  await page.setContent('<header><button aria-label="Account 0x1cb4…6076">0x1cb4…6076</button></header>');
  expect((await connectedAccountOf(page, intended, 1_000)).account).toBeNull();
  await page.setContent("<header><button>Connect</button></header>");
  expect(await connectedAccountOf(page, intended, 1_000)).toEqual({ account: null, reason: "the new app connected no account (its header shows no account)" });
});

test("P-14: 'Answered too soon' replaces production's 'Invalid' only on a case whose recorded current ruling is 2²⁵⁶ − 1", () => {
  const options = { type: "single-select", titles: ["Harris", "Trump"], reserved: {}, precision: null } as const;
  // The new app's text is core's §5.9 formatting of that ruling.
  expect(formatRuling(2n ** 256n - 1n, { type: options.type, titles: options.titles }, null)).toBe("Answered too soon");
  const decision = (rulingText: string) => ({ kind: "winner", rulingText, wonBy: "jury" }) as const;
  const production = snapshot("production", { rulingOptions: options, decision: decision("Invalid") });
  const at = (rulingText: string) => snapshot("new", { rulingOptions: options, decision: decision(rulingText), timeline: EXECUTION_TIMELINE });
  for (const disputeId of [1650, 1657]) {
    expect(fieldOf(evaluateFor(stableCase(1, disputeId), production, at("Answered too soon")), "decision.rulingText"), `mainnet ${disputeId.toString()}`).toMatchObject({
      status: "expected-difference",
      entries: ["P-14"],
    });
  }
  expect(fieldOf(evaluateFor(stableCase(1, 1454), production, at("Answered too soon")), "decision.rulingText").status).toBe("difference");
  expect(fieldOf(evaluateFor(null, production, at("Answered too soon")), "decision.rulingText").status).toBe("difference");
  expect(fieldOf(evaluateFor(stableCase(1, 1650), production, at("Harris")), "decision.rulingText").status).toBe("difference");
  const otherProduction = snapshot("production", { rulingOptions: options, decision: decision("Trump") });
  expect(fieldOf(evaluateFor(stableCase(1, 1650), otherProduction, at("Answered too soon")), "decision.rulingText").status).toBe("difference");
});

test("1621: production failing to settle is an environment result, while the new app's 04 §2 checks still block", () => {
  const testCase = stableCase(1, 1621);
  const unsettled = snapshot("production", { settled: false, title: null, question: null, descriptionText: null, rulingOptions: null, timeline: null, metaEvidenceLoaded: false });
  const governor = (titles: readonly string[]) =>
    snapshot("new", {
      arbitrable: testCase.arbitrable.toLowerCase(),
      family: "governor",
      rulingOptions: { type: "single-select", titles, reserved: {}, precision: null },
      evidence: [1, 2].map((timestamp) => ({ title: "t", descriptionText: "", submitter: EXAMPLE_SUBMITTER, timestamp, attachmentHref: null })),
      timeline: EXECUTION_TIMELINE,
    });
  const blockingFailures = (production: CaseSnapshot, next: CaseSnapshot) =>
    [...checkSettled(production, next, testCase), ...checkHighlights(testCase, next)].filter((check) => check.blocking && !check.ok).map((check) => check.name);

  const loaded = governor(["List 7", "List 8"]);
  expect(evaluateFor(testCase, unsettled, loaded).filter((result) => result.status === "difference")).toEqual([]);
  expect(fieldOf(evaluateFor(testCase, unsettled, loaded), "title")).toMatchObject({ status: "skipped", detail: expect.stringContaining("environment result") });
  expect(blockingFailures(unsettled, loaded)).toEqual([]);
  expect(checkSettled(unsettled, loaded, testCase)[0]).toMatchObject({ ok: false, blocking: false });
  // A production page that settled without its meta-evidence is the same environment failure.
  const failedScript = snapshot("production", { ...unsettled, settled: true });
  expect(evaluateFor(testCase, failedScript, loaded).filter((result) => result.status === "difference")).toEqual([]);

  expect(blockingFailures(unsettled, governor(["List 1", "List 2"]))).toEqual(["titles"]);
  expect(blockingFailures(unsettled, snapshot("new", { ...loaded, settled: false }))).toEqual(["the new app settled within its budget"]);
  // Once production settles, the case is compared as any other, and no other case gets the environment treatment.
  expect(fieldOf(evaluateFor(testCase, snapshot("production"), loaded), "rulingOptions").status).toBe("difference");
  expect(checkSettled(unsettled, loaded, stableCase(1, 1676))[0]).toMatchObject({ ok: false, blocking: true });
});
