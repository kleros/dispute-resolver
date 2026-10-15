import type { Locator, Page } from "@playwright/test";
import { CASE_SETTLE_MS, PROD_URL } from "../config";
import type {
  AppealCardSnapshot,
  AppealPanelSnapshot,
  CaseField,
  CaseSnapshot,
  DecisionSnapshot,
  EvidenceSnapshot,
  RulingOptionsSnapshot,
  TimelineColumn,
  TimelineState,
} from "../types";
import {
  attributeOf,
  collapse,
  countdownSeconds,
  etherToWei,
  evidenceDisplayOf,
  integerOrNull,
  nowSeconds,
  recordedPageUrl,
  textOf,
  utcStringToSeconds,
  waitUntilStable,
} from "./common";
import { readProductionCardCodes, readProductionCaseState, type ProductionCaseState } from "./productionState";

// The production extractor (https://resolve.kleros.io, the old app of src/ on master). CSS-module class names are hashed
// at build time (`disputeSummary_h1__2Xb9c`), so elements are selected by the stable `module_name__` prefix.

function css(module: string, name: string): string {
  return `[class*="${module}_${name}__"]`;
}

const NOT_FOUND_TEXT = "does not exist on this network";
const META_EVIDENCE_FAILED_TEXT = "Failed to load metaevidence";

/** `QuestionTypes` of `disputeDetails.js`: the label production prints, back to the ruling-options type. */
const QUESTION_TYPES: Readonly<Record<string, string>> = {
  "Multiple choice: single select": "single-select",
  "Multiple choice: multiple select": "multiple-select",
  "Non-negative number": "uint",
  Number: "int",
  Text: "string",
  Date: "datetime",
  Hash: "hash",
};

/** The titles of `realityQuestionNotice.js`, back to the notice kind. */
const REALITY_NOTICES: Readonly<Record<string, string>> = {
  "Other interfaces may show different answer options for this question": "divergent",
  "The question parameters are malformed": "malformed",
  "The answer options of this question could not be determined": "unresolvable",
  "The answer options of this question could not be verified": "unverified",
};

/** The types production renders a voting-options list for. */
const LISTED_TYPES: ReadonlySet<string> = new Set(["single-select", "multiple-select"]);

const UNOBSERVABLE: Readonly<Partial<Record<CaseField, string>>> = {
  family: "production has no family; 04 §1 compares it on the new app only",
  hiddenEvidenceCount: "production hides invalid evidence silently (D-22)",
};

/**
 * Production is settled when the dispute is not found, or when its loading flag is down and either the meta-evidence
 * failed (no details are ever rendered then) or the details section rendered, which also waits for the court list.
 */
async function pageReady(page: Page): Promise<boolean> {
  if ((await page.getByText(NOT_FOUND_TEXT).count()) > 0) return true;
  const state = await readProductionCaseState(page);
  if (!state.found || state.loading) return false;
  if ((await page.locator('main [role="status"]').count()) > 0) return false;
  if ((await page.getByText(META_EVIDENCE_FAILED_TEXT).count()) > 0) return true;
  return (await page.locator(`${css("disputeSummary", "disputeSummary")} h1`).count()) > 0 && (await page.locator(css("disputeDetails", "disputeDetails")).count()) > 0;
}

const HEADER_VIEW_ONLY_TEXT = "Actions that require an Ethereum account are disabled";

/** Production shows the header's view-only banner while it has no account; the harness account must have replaced it. */
async function accountReason(page: Page, account: string | null): Promise<string | null> {
  if (account === null) return null;
  return (await page.locator("header", { hasText: HEADER_VIEW_ONLY_TEXT }).count()) > 0
    ? "production did not pick up the harness account (its header still shows view-only)"
    : null;
}

async function fingerprint(page: Page): Promise<string | null> {
  if (!(await pageReady(page))) return null;
  const text = (await page.locator("#root").textContent()) ?? "";
  // Countdowns tick every minute; digits are left out so a running countdown does not keep the page "unstable".
  return text.replace(/\d/g, "");
}

/** The voting options are a react-bootstrap dropdown mounted only when opened, inside the collapsed Question section. */
async function openVotingOptions(page: Page): Promise<Locator> {
  const question = page.locator(css("disputeDetails", "question"));
  // A role query skips the collapsed section's hidden button, so the toggle is found by its text.
  const toggle = question.locator("button", { hasText: "View Voting Options" });
  if ((await toggle.count()) === 0) return question.locator(".dropdown-item");
  await page.locator(".card-header", { hasText: /^Question$/ }).click();
  await toggle.waitFor({ state: "visible" });
  await toggle.click();
  const items = question.locator(".dropdown-item");
  await items.first().waitFor({ state: "attached", timeout: 10_000 });
  return items;
}

interface OptionItem {
  readonly code: string;
  readonly title: string;
}

/** `Option N - Title: description` or `Option N - Title ` (no description); the first `: ` separates the description. */
function parseOptionItem(text: string): OptionItem | null {
  const match = /^Option (\S+) - ([\s\S]*)$/.exec(text);
  if (match === null) return null;
  const rest = match[2] ?? "";
  // Without a description the item ends with a space; an empty description still prints its colon (`Title: `).
  const separator = rest.indexOf(": ");
  let title = rest;
  if (rest.endsWith(" ")) title = rest.trimEnd().replace(/:$/, "");
  else if (separator >= 0) title = rest.slice(0, separator);
  return { code: match[1] ?? "", title: collapse(title) };
}

/**
 * The type from its label, and the titles and reserved options from the voting-options list, which production renders
 * for the single- and multiple-select types only. Production never renders the precision.
 */
async function rulingOptionsOf(page: Page): Promise<RulingOptionsSnapshot | null> {
  const question = page.locator(css("disputeDetails", "question"));
  const label = await textOf(question.locator(":scope > p").first());
  const type = label === null ? undefined : QUESTION_TYPES[label];
  if (type === undefined) return null;
  if (!LISTED_TYPES.has(type)) return { type, titles: [], reserved: {}, precision: null };
  const items = await openVotingOptions(page);
  const texts = (await items.allTextContents()).slice(1);
  const parsed = texts.map(parseOptionItem).filter((item): item is OptionItem => item !== null);
  const titles = parsed.filter((item, index) => item.code === String(index + 1)).map((item) => item.title);
  const reserved = Object.fromEntries(parsed.slice(titles.length).map((item) => [item.code, item.title]));
  return { type, titles, reserved, precision: null };
}

const TIMELINE_COLUMNS: readonly [string, string][] = [
  ["evidence", "evidence"],
  ["voting", "vote"],
  ["appeal", "appeal"],
];

function timelineState(classes: string): TimelineState {
  if (/(^|\s)current(\s|$)/.test(classes)) return "current";
  if (/(^|\s)past(\s|$)/.test(classes)) return "concluded";
  return "upcoming";
}

async function timelineOf(page: Page): Promise<TimelineColumn[] | null> {
  const columns: TimelineColumn[] = [];
  for (const [module, name] of TIMELINE_COLUMNS) {
    const classes = await attributeOf(page.locator(css("disputeTimeline", module)), "class");
    if (classes === null) return null;
    columns.push({ name, state: timelineState(classes) });
  }
  return columns;
}

/** The period from production's three columns: Commit shows as "Evidence concluded, Voting upcoming" (D-39), all past is 4. */
function periodOf(timeline: readonly TimelineColumn[] | null): number | null {
  if (timeline === null) return null;
  const [evidence, vote, appeal] = timeline.map((column) => column.state);
  if (evidence === "current") return 0;
  if (vote === "current") return 2;
  if (appeal === "current") return 3;
  if (appeal === "concluded") return 4;
  return evidence === "concluded" ? 1 : null;
}

async function decisionOf(page: Page, hasDetails: boolean): Promise<DecisionSnapshot | null> {
  if (!hasDetails) return null;
  const alert = page.locator(css("alertMessage", "alertMessage"), { has: page.locator(css("alertMessage", "title"), { hasText: /^(Winner|Jury decision): / }) });
  const title = await textOf(alert.locator(css("alertMessage", "title")));
  if (title === null) return { kind: "none", rulingText: "", wonBy: null };
  const content = await textOf(alert.locator("span").last());
  if (title.startsWith("Winner: ")) {
    return { kind: "winner", rulingText: title.slice("Winner: ".length), wonBy: content === "Won by default" ? "default" : "jury" };
  }
  return { kind: "jury-decision", rulingText: title.slice("Jury decision: ".length), wonBy: null };
}

async function realityNoticeOf(page: Page, hasDetails: boolean): Promise<string | null> {
  if (!hasDetails) return null;
  const titles = await page.locator(css("alertMessage", "title")).allTextContents();
  for (const title of titles) {
    const kind = REALITY_NOTICES[collapse(title)];
    if (kind !== undefined) return kind;
  }
  return "none";
}

function percentOf(text: string | null): number | null {
  const match = text === null ? null : /^(\d{1,3}(?:\.\d{1,2})?)% Funded/.exec(text);
  return match === null ? null : Number(match[1]);
}

async function cardsOf(body: Locator, takenAt: number): Promise<AppealCardSnapshot[]> {
  const cards = body.locator(css("crowdfundingCard", "crowdfundingCard"));
  const codes = await readProductionCardCodes(cards);
  const snapshots: AppealCardSnapshot[] = [];
  for (let index = 0; index < (await cards.count()); index += 1) {
    const card = cards.nth(index);
    const remaining = await card.locator("input#contribution").inputValue();
    const countdown = countdownSeconds(await textOf(card.locator(css("crowdfundingCard", "countdown"))));
    snapshots.push({
      title: (await textOf(card.locator("strong").first())) ?? "",
      code: codes[index] ?? null,
      fundedPercent: percentOf(await textOf(card.locator(".text-success"))),
      remainingWei: etherToWei(remaining),
      deadline: countdown === null ? null : takenAt + countdown,
    });
  }
  return snapshots;
}

/** The withdrawable amount: the "Withdraw X ETH" button, or zero when production says there is nothing to withdraw. */
async function withdrawableOf(body: Locator): Promise<string | null> {
  const button = await textOf(body.locator("button", { hasText: /^Withdraw / }));
  const amount = button === null ? null : /^Withdraw ([\d.]{1,80}) /.exec(button);
  return amount === null ? "0" : etherToWei(amount[1] ?? null);
}

async function appealPanelOf(page: Page, takenAt: number): Promise<AppealPanelSnapshot> {
  const card = page.locator(".card", { has: page.locator(".card-header", { hasText: /^Appeal$/ }) });
  if ((await card.count()) === 0) return { kind: "hidden", cards: [], withdrawableWei: null };
  const body = card.locator(".card-body");
  const heading = await textOf(body.locator(".h1"));
  if (heading === "Appeal period ended") return { kind: "escrow-ended", cards: [], withdrawableWei: null };
  if (heading === "Withdraw crowdfunding rewards and refunds") return { kind: "withdraw", cards: [], withdrawableWei: await withdrawableOf(body) };
  if ((await body.getByText("you need to pay the appeal cost").count()) > 0) return { kind: "escrow-appeal", cards: [], withdrawableWei: null };
  if ((await body.getByText("Appeal fees could not be calculated").count()) > 0) return { kind: "fees-unavailable", cards: [], withdrawableWei: null };
  return { kind: "crowdfunding", cards: await cardsOf(body, takenAt), withdrawableWei: null };
}

/** Production's own submitter address for a rendered item whose sender line is truncated to `0x1234...abcd`. */
function fullSubmitter(truncated: string, timestamp: number | null, state: ProductionCaseState): string {
  const [prefix = "", suffix = ""] = truncated.toLowerCase().split("...");
  const match = state.evidences.find(
    (record) => record.submittedAt === timestamp && record.submittedBy.toLowerCase().startsWith(prefix) && record.submittedBy.toLowerCase().endsWith(suffix),
  );
  return match?.submittedBy ?? truncated;
}

async function evidenceOf(page: Page, state: ProductionCaseState): Promise<EvidenceSnapshot[] | null> {
  const timeline = page.locator("#evidence-timeline");
  if ((await timeline.count()) === 0) return null;
  const items = timeline.locator(css("evidenceTimeline", "evidence"));
  const evidence: EvidenceSnapshot[] = [];
  for (let index = 0; index < (await items.count()); index += 1) {
    const item = items.nth(index);
    const sender = (await textOf(item.locator(css("evidenceTimeline", "sender")))) ?? "";
    const timestamp = utcStringToSeconds(await textOf(item.locator(css("evidenceTimeline", "timestamp"))));
    evidence.push({
      title: (await textOf(item.locator(`${css("evidenceTimeline", "header")} p`))) ?? "",
      descriptionText: (await textOf(item.locator(":scope > p"))) ?? "",
      submitter: fullSubmitter(sender.replace(/^Submitted by:\s*/, ""), timestamp, state),
      timestamp,
      attachmentHref: await attributeOf(item.locator(`${css("evidenceTimeline", "footer")} > a`), "href"),
    });
  }
  return evidence;
}

async function compatibilityOf(page: Page): Promise<"full" | "view-only"> {
  const banner = page.locator("#root > div", { hasText: "is not compatible with the interface of Dispute Resolver" });
  return (await banner.count()) > 0 ? "view-only" : "full";
}

function notFoundSnapshot(url: string, account: string | null, takenAt: number, settled: boolean): CaseSnapshot {
  return {
    screen: "case",
    app: "production",
    url,
    takenAt,
    settled,
    account,
    state: "not-found",
    exists: false,
    arbitrable: null,
    family: null,
    compatibility: null,
    title: null,
    question: null,
    descriptionText: null,
    rulingOptions: null,
    period: null,
    lastPeriodChange: null,
    timeline: null,
    numberOfVotes: null,
    courtName: null,
    decision: null,
    realityNotice: null,
    appealPanel: { kind: "hidden", cards: [], withdrawableWei: null },
    evidence: null,
    hiddenEvidenceCount: null,
    links: { court: null, arbitrableApp: null, metaEvidenceFile: null },
    evidenceDisplay: null,
    metaEvidenceLoaded: false,
    metaEvidenceFailure: null,
    unobservable: UNOBSERVABLE,
  };
}

/** Loads production's case page for one dispute and extracts its parity snapshot. */
export async function extractProductionCase(page: Page, chainId: number, disputeId: number, account: string | null): Promise<CaseSnapshot> {
  const screenPath = `${chainId.toString()}/cases/${disputeId.toString()}`;
  const target = `${PROD_URL}/${screenPath}`;
  await page.goto(target);
  const url = recordedPageUrl(PROD_URL, screenPath);
  const settled = await waitUntilStable(page, () => fingerprint(page), CASE_SETTLE_MS);
  const takenAt = nowSeconds();
  if ((await page.getByText(NOT_FOUND_TEXT).count()) > 0) return notFoundSnapshot(url, account, takenAt, settled);

  const state = await readProductionCaseState(page);
  const noAccount = await accountReason(page, account);
  const summary = page.locator(css("disputeSummary", "disputeSummary"));
  const title = await textOf(summary.locator("h1"));
  const timeline = await timelineOf(page);
  const hasDetails = timeline !== null;
  const rulingOptions = hasDetails ? await rulingOptionsOf(page) : null;
  const question = hasDetails ? await textOf(page.locator(`${css("disputeDetails", "question")} > p`).nth(1)) : null;

  return {
    screen: "case",
    app: "production",
    url,
    takenAt,
    settled,
    account: noAccount === null ? account : null,
    state: state.arbitrated === null ? "loading" : "dispute",
    exists: state.arbitrated !== null,
    arbitrable: state.arbitrated,
    family: null,
    compatibility: await compatibilityOf(page),
    title,
    question: question === "" ? null : question,
    descriptionText: await textOf(summary.locator(css("disputeSummary", "description"))),
    rulingOptions,
    period: periodOf(timeline),
    lastPeriodChange: state.lastPeriodChange,
    timeline,
    numberOfVotes: integerOrNull(await textOf(page.locator("#initialNumberOfJurors span"))),
    courtName: await textOf(page.locator("#court span")),
    decision: await decisionOf(page, hasDetails),
    realityNotice: await realityNoticeOf(page, hasDetails),
    appealPanel: await appealPanelOf(page, takenAt),
    evidence: await evidenceOf(page, state),
    hiddenEvidenceCount: null,
    links: {
      court: await attributeOf(page.locator('main label a[href*="court.kleros.io"]'), "href"),
      arbitrableApp: await attributeOf(summary.locator("a", { hasText: "Go to arbitrable application from here" }), "href"),
      metaEvidenceFile: await attributeOf(summary.locator(`${css("disputeSummary", "footer")} a`), "href"),
    },
    evidenceDisplay: await evidenceDisplayOf(summary.locator('iframe[title="evidence-display"]'), target),
    metaEvidenceLoaded: title !== null,
    metaEvidenceFailure: await textOf(page.getByText(META_EVIDENCE_FAILED_TEXT)),
    unobservable: noAccount === null ? UNOBSERVABLE : { ...UNOBSERVABLE, "appealPanel.withdrawableWei": noAccount },
  };
}
