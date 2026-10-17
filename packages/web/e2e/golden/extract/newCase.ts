import type { Locator, Page } from "@playwright/test";
import { CASE_SETTLE_MS, NEW_URL } from "../config";
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
import { sameAddress } from "../compare/values";
import { SUBMIT_EVIDENCE_LABEL, VIEW_ONLY_SUBMIT_LABEL, type SubmitControlState } from "../liveChecks";
import { attributeOf, evidenceDisplayOf, integerOrNull, nowSeconds, recordedPageUrl, textOf, utcStringToSeconds, waitUntilStable } from "./common";

// The new app's extractor reads the parity hooks of packages/web/ARCHITECTURE.md §12.1 (`src/parity`). Two things §12
// has no hook for are read from what the user sees: the connected account in the header (04 §1 account context) and the
// "Dispute summary unavailable" notice of a degraded meta-evidence section (D-36).

function byTestId(id: string): string {
  return `[data-testid="${id}"]`;
}

async function fingerprint(page: Page): Promise<string | null> {
  const state = await attributeOf(page.locator(byTestId("case-page")), "data-state");
  if (state === null || state === "loading") return null;
  if ((await page.locator('main [aria-busy="true"]').count()) > 0) return null;
  const text = (await page.locator("main").textContent()) ?? "";
  return `${state}|${text.replace(/\d/g, "")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rulingOptionsFrom(json: string | null): RulingOptionsSnapshot | null {
  if (json === null) return null;
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed) || typeof parsed.type !== "string") return null;
  const titles = Array.isArray(parsed.titles) ? parsed.titles.map(String) : [];
  const reserved = isRecord(parsed.reserved) ? Object.fromEntries(Object.entries(parsed.reserved).map(([code, title]) => [code, String(title)])) : {};
  return { type: parsed.type, titles, reserved, precision: typeof parsed.precision === "number" ? parsed.precision : null };
}

const TIMELINE_STATES: ReadonlySet<string> = new Set(["concluded", "current", "upcoming"]);

async function timelineOf(page: Page): Promise<TimelineColumn[] | null> {
  const columns = await page
    .locator(byTestId("timeline-column"))
    .evaluateAll((elements) => elements.map((element) => ({ name: element.getAttribute("data-name") ?? "", state: element.getAttribute("data-state") ?? "" })));
  if (columns.length === 0) return null;
  return columns.map((column) => ({ name: column.name, state: (TIMELINE_STATES.has(column.state) ? column.state : "upcoming") as TimelineState }));
}

async function decisionOf(page: Page): Promise<DecisionSnapshot | null> {
  const element = page.locator(byTestId("case-decision"));
  const kind = await attributeOf(element, "data-kind");
  if (kind !== "none" && kind !== "jury-decision" && kind !== "winner") return null;
  const wonBy = await attributeOf(element, "data-won-by");
  return {
    kind,
    rulingText: (await textOf(element.locator(byTestId("case-decision-ruling")))) ?? "",
    wonBy: wonBy === "default" || wonBy === "jury" ? wonBy : null,
  };
}

function numberOrNull(value: string | null): number | null {
  if (value === null || value.trim() === "" || Number.isNaN(Number(value))) return null;
  return Number(value);
}

async function cardsOf(panel: Locator): Promise<AppealCardSnapshot[]> {
  const cards = panel.locator(byTestId("appeal-card"));
  const snapshots: AppealCardSnapshot[] = [];
  for (let index = 0; index < (await cards.count()); index += 1) {
    const card = cards.nth(index);
    snapshots.push({
      title: (await textOf(card.locator(byTestId("appeal-card-title")))) ?? "",
      code: await card.getAttribute("data-code"),
      fundedPercent: numberOrNull(await card.getAttribute("data-funded-percent")),
      remainingWei: await card.getAttribute("data-remaining-wei"),
      deadline: integerOrNull(await card.getAttribute("data-deadline")),
    });
  }
  return snapshots;
}

async function appealPanelOf(page: Page): Promise<AppealPanelSnapshot> {
  const panel = page.locator(byTestId("appeal-panel"));
  const kind = await attributeOf(panel, "data-kind");
  if (kind === null) return { kind: "hidden", cards: [], withdrawableWei: null };
  return { kind, cards: await cardsOf(panel), withdrawableWei: await attributeOf(panel, "data-withdrawable-wei") };
}

async function evidenceOf(page: Page): Promise<EvidenceSnapshot[] | null> {
  const items = page.locator(byTestId("evidence-item"));
  const hiddenCount = page.locator(byTestId("evidence-hidden-count"));
  if ((await items.count()) === 0 && (await hiddenCount.count()) === 0) return null;
  const evidence: EvidenceSnapshot[] = [];
  for (let index = 0; index < (await items.count()); index += 1) {
    const item = items.nth(index);
    const timestamp = integerOrNull(await item.getAttribute("data-timestamp"));
    evidence.push({
      title: (await textOf(item.locator(byTestId("evidence-title")))) ?? "",
      descriptionText: (await textOf(item.locator(byTestId("evidence-description")))) ?? "",
      submitter: (await item.getAttribute("data-submitter")) ?? "",
      timestamp: timestamp ?? utcStringToSeconds(await textOf(item.locator("time"))),
      attachmentHref: await attributeOf(item.locator(byTestId("evidence-attachment")), "href"),
    });
  }
  return evidence;
}

/** The header's account button (`wallet/AccountMenu.tsx`), present only while a wallet is connected. */
const ACCOUNT_BUTTON_NAME = /^Account (0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4})$/;
/** How long the header may take to show the reconnected harness account. */
const ACCOUNT_WAIT_MS = 30_000;

export interface ConnectedAccount {
  /** The intended account when the header shows it as connected, else `null`. */
  readonly account: string | null;
  /** Why the intended account is not the connected one, when `account` is `null`. */
  readonly reason: string | null;
}

/**
 * The account the new app connected (04 §1: "the snapshot records which account was used"), read from its header
 * rather than assumed. The header shows `0x1234…abcd`, so the intended account is matched on that prefix and suffix.
 */
export async function connectedAccountOf(page: Page, intended: string, waitMs: number = ACCOUNT_WAIT_MS): Promise<ConnectedAccount> {
  const button = page.getByRole("button", { name: ACCOUNT_BUTTON_NAME });
  const connected = await button
    .first()
    .waitFor({ state: "attached", timeout: waitMs })
    .then(
      () => true,
      () => false,
    );
  if (!connected) return { account: null, reason: "the new app connected no account (its header shows no account)" };
  const shown = ACCOUNT_BUTTON_NAME.exec((await button.first().getAttribute("aria-label")) ?? "")?.[1] ?? null;
  if (shown === null || !sameAddress(shown, intended)) return { account: null, reason: `the new app connected another account (${shown ?? "unreadable"})` };
  return { account: intended, reason: null };
}

const SUMMARY_UNAVAILABLE = /^\s*Dispute summary unavailable\s*$/;

/** The reason of the "Dispute summary unavailable" notice (`ui/SectionUnavailable.tsx`), `""` without one, `null` without the notice. */
async function metaEvidenceFailureOf(page: Page): Promise<string | null> {
  const heading = page.locator("h2", { hasText: SUMMARY_UNAVAILABLE });
  if ((await heading.count()) === 0) return null;
  return (await textOf(heading.first().locator("xpath=following-sibling::small[1]"))) ?? "";
}

/**
 * The submit-evidence control of the Evidence panel (spec 5.14), which §12 has no hook for: the button by its accessible
 * name, inside the collapsed accordion body too. `{ label: null }` when the panel shows neither button.
 */
export async function submitControlOf(page: Page): Promise<SubmitControlState> {
  for (const label of [SUBMIT_EVIDENCE_LABEL, VIEW_ONLY_SUBMIT_LABEL]) {
    const button = page.getByRole("button", { name: label, exact: true, includeHidden: true });
    if ((await button.count()) > 0) return { label, disabled: await button.first().isDisabled() };
  }
  return { label: null, disabled: null };
}

function compatibilityFrom(value: string | null): "full" | "view-only" | null {
  return value === "full" || value === "view-only" ? value : null;
}

/** Loads the new app's case page for one dispute and extracts its parity snapshot. */
export async function extractNewCase(page: Page, chainId: number, disputeId: number, account: string | null, accountSkipReason: string | null): Promise<CaseSnapshot> {
  const screenPath = `${chainId.toString()}/cases/${disputeId.toString()}`;
  const target = `${NEW_URL}/${screenPath}`;
  await page.goto(target);
  const url = recordedPageUrl(NEW_URL, screenPath);
  const connected: ConnectedAccount = account === null || accountSkipReason !== null ? { account: null, reason: accountSkipReason } : await connectedAccountOf(page, account);
  const settled = await waitUntilStable(page, () => fingerprint(page), CASE_SETTLE_MS);
  const takenAt = nowSeconds();
  const root = page.locator(byTestId("case-page"));
  const state = (await attributeOf(root, "data-state")) ?? "loading";
  const unobservable: Partial<Record<CaseField, string>> = {};
  if (connected.reason !== null) unobservable["appealPanel.withdrawableWei"] = connected.reason;
  const title = await textOf(page.locator(byTestId("case-title")));
  const hiddenCount = await attributeOf(page.locator(byTestId("evidence-hidden-count")), "data-count");

  return {
    screen: "case",
    app: "new",
    url,
    takenAt,
    settled,
    account: connected.account,
    state,
    exists: state === "dispute",
    arbitrable: await attributeOf(root, "data-arbitrable"),
    family: await attributeOf(root, "data-family"),
    compatibility: compatibilityFrom(await attributeOf(root, "data-compatibility")),
    title,
    question: await textOf(page.locator(byTestId("case-question"))),
    descriptionText: await textOf(page.locator(byTestId("case-description"))),
    rulingOptions: rulingOptionsFrom(await attributeOf(page.locator(byTestId("case-ruling-options")), "data-ruling-options")),
    period: integerOrNull(await attributeOf(root, "data-period")),
    lastPeriodChange: integerOrNull(await attributeOf(root, "data-last-period-change")),
    timeline: await timelineOf(page),
    numberOfVotes: integerOrNull(await attributeOf(page.locator(byTestId("case-votes")), "data-value")),
    courtName: await textOf(page.locator(byTestId("case-court"))),
    decision: await decisionOf(page),
    realityNotice: await attributeOf(root, "data-reality-notice"),
    appealPanel: await appealPanelOf(page),
    evidence: await evidenceOf(page),
    hiddenEvidenceCount: integerOrNull(hiddenCount),
    links: {
      court: await attributeOf(page.locator(byTestId("link-court")), "href"),
      arbitrableApp: await attributeOf(page.locator(byTestId("link-arbitrable-app")), "href"),
      metaEvidenceFile: await attributeOf(page.locator(byTestId("link-meta-evidence-file")), "href"),
    },
    evidenceDisplay: await evidenceDisplayOf(page.locator(byTestId("evidence-display")), target),
    metaEvidenceLoaded: title !== null,
    metaEvidenceFailure: await metaEvidenceFailureOf(page),
    unobservable,
  };
}
