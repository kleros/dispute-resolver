import type { Locator, Page } from "@playwright/test";
import { CREATE_SETTLE_MS, NEW_URL, ONGOING_SETTLE_MS, PROD_URL } from "../config";
import type { CreateSnapshot, OngoingDisputeSnapshot, OngoingSnapshot } from "../types";
import { attributeOf, collapse, countdownSeconds, etherToWei, integerOrNull, nowSeconds, recordedPageUrl, textOf, waitUntilStable } from "./common";

// Extractors of the Ongoing and Create snapshots (04 §1) for both apps. Production is read from its DOM (CSS-module
// classes by their stable prefix), the new app from the parity hooks of ARCHITECTURE.md §12.2.

function css(module: string, name: string): string {
  return `[class*="${module}_${name}__"]`;
}

function byTestId(id: string): string {
  return `[data-testid="${id}"]`;
}

/** Text with digits removed: a ticking countdown does not keep a page from settling. */
async function stableText(locator: Locator): Promise<string> {
  return ((await locator.textContent()) ?? "").replace(/\d/g, "");
}

const PERIOD_CLASSES = ["evidence", "commit", "vote", "appeal", "execution"];

async function productionOngoingState(page: Page): Promise<string | null> {
  if ((await page.getByText("There is no arbitrator on this network").count()) > 0) return "no-arbitrator";
  if ((await page.locator('main [role="status"]').count()) > 0) return null;
  if ((await page.getByText("Failed to load disputes.").count()) > 0) return "failed";
  if ((await page.getByText("There are no open disputes.").count()) > 0) return "empty";
  return (await page.locator(css("ongoing-card", "ongoingCard")).count()) > 0 ? "list" : null;
}

/**
 * When the card's period ends by production's countdown. Production renders the countdown only while time is left
 * (`ongoing-card.js`: `remainingTime > 0`), so a card that shows its court but no countdown has already reached the end
 * of its period; a card still loading its court has no known end.
 */
async function productionPeriodEnd(card: Locator, takenAt: number, courtName: string): Promise<number | null> {
  const countdown = card.locator(css("ongoing-card", "countdown"));
  if ((await countdown.count()) === 0) return courtName === "" ? null : takenAt;
  const seconds = countdownSeconds(await textOf(countdown));
  return seconds === null ? null : takenAt + seconds;
}

async function productionDispute(card: Locator, takenAt: number): Promise<OngoingDisputeSnapshot> {
  const status = (await attributeOf(card.locator(css("ongoing-card", "status")), "class")) ?? "";
  const period = PERIOD_CLASSES.findIndex((name) => status.split(/\s+/).includes(name));
  const courtName = (await textOf(card.locator(`${css("ongoing-card", "badge")} span`))) ?? "";
  return {
    id: (await textOf(card.locator(css("ongoing-card", "disputeID")))) ?? "",
    title: (await textOf(card.locator(css("ongoing-card", "title")))) ?? "",
    courtName,
    period: period < 0 ? null : period,
    countdownPresent: (await card.locator(css("ongoing-card", "countdown")).count()) > 0,
    periodEndsAt: await productionPeriodEnd(card, takenAt, courtName),
  };
}

/** Production's Ongoing page on one chain, once every card has its court and the list stopped changing. */
export async function extractProductionOngoing(page: Page, chainId: number): Promise<OngoingSnapshot> {
  const screenPath = `${chainId.toString()}/ongoing`;
  await page.goto(`${PROD_URL}/${screenPath}`);
  const url = recordedPageUrl(PROD_URL, screenPath);
  const settled = await waitUntilStable(page, async () => ((await productionOngoingState(page)) === null ? null : stableText(page.locator("main"))), ONGOING_SETTLE_MS);
  const takenAt = nowSeconds();
  const state = (await productionOngoingState(page)) ?? "loading";
  const cards = page.locator(css("ongoing-card", "ongoingCard"));
  const disputes: OngoingDisputeSnapshot[] = [];
  for (let index = 0; index < (await cards.count()); index += 1) disputes.push(await productionDispute(cards.nth(index), takenAt));
  return { screen: "ongoing", app: "production", url, takenAt, settled, chain: chainId, state, disputes, unobservable: {} };
}

async function newDispute(card: Locator): Promise<OngoingDisputeSnapshot> {
  return {
    id: (await card.getAttribute("data-dispute-id")) ?? "",
    title: (await textOf(card.locator(byTestId("ongoing-card-title")))) ?? "",
    courtName: (await textOf(card.locator(byTestId("ongoing-card-court")))) ?? "",
    period: integerOrNull(await card.getAttribute("data-period")),
    countdownPresent: (await card.locator(byTestId("ongoing-card-countdown")).count()) > 0,
    periodEndsAt: null,
  };
}

/** The new app's Ongoing page on one chain. */
export async function extractNewOngoing(page: Page, chainId: number): Promise<OngoingSnapshot> {
  const screenPath = `${chainId.toString()}/ongoing`;
  await page.goto(`${NEW_URL}/${screenPath}`);
  const url = recordedPageUrl(NEW_URL, screenPath);
  const root = page.locator(byTestId("ongoing-page"));
  const settled = await waitUntilStable(
    page,
    async () => {
      const state = await attributeOf(root, "data-state");
      if (state === null || state === "loading" || (await page.locator('main [aria-busy="true"]').count()) > 0) return null;
      return stableText(page.locator("main"));
    },
    ONGOING_SETTLE_MS,
  );
  const takenAt = nowSeconds();
  const cards = page.locator(byTestId("ongoing-card"));
  const disputes: OngoingDisputeSnapshot[] = [];
  for (let index = 0; index < (await cards.count()); index += 1) disputes.push(await newDispute(cards.nth(index)));
  return { screen: "ongoing", app: "new", url, takenAt, settled, chain: chainId, state: (await attributeOf(root, "data-state")) ?? "loading", disputes, unobservable: {} };
}

/**
 * Production's `required` attributes, by element id, under the new app's `data-field` names (core's `requiredFields`).
 * The court and question-type dropdowns carry the attribute on their wrapper, which holds the toggle's id.
 */
const PRODUCTION_FIELD_NAMES: readonly [RegExp, string][] = [
  [/^subcourt-dropdown$/, "courtId"],
  [/^initialNumberOfJurors$/, "votes"],
  [/^title$/, "title"],
  [/^questionType$/, "questionType"],
  [/^numberOfRulingOptions$/, "optionCount"],
  [/^question$/, "question"],
  [/^rulingOption\d+Title$/, "optionTitles"],
];

function productionFieldName(id: string): string {
  return PRODUCTION_FIELD_NAMES.find(([pattern]) => pattern.test(id))?.[1] ?? id;
}

/** The items of one react-bootstrap dropdown, which mounts its menu only when opened. */
async function dropdownItems(page: Page, toggleId: string): Promise<string[]> {
  const toggle = page.locator(`#${toggleId}`);
  await toggle.click();
  const items = page.locator(".dropdown", { has: toggle }).locator(".dropdown-item");
  await items.first().waitFor({ state: "attached", timeout: 10_000 });
  const texts = (await items.allTextContents()).map(collapse);
  await toggle.click();
  return texts;
}

async function productionRequiredFields(page: Page): Promise<string[]> {
  const ids = await page
    .locator("form [required]")
    .evaluateAll((elements) => elements.map((element) => (element.id === "" ? (element.querySelector("[id]")?.id ?? "") : element.id)));
  return [...new Set(ids.map(productionFieldName))];
}

async function productionCreateReady(page: Page): Promise<string | null> {
  if ((await page.locator("main h1", { hasText: "can't create a dispute" }).count()) > 0) return "unavailable";
  const court = await textOf(page.locator("#subcourt-dropdown"));
  const cost = await textOf(page.locator(css("createForm", "arbitrationFee")));
  if (court === null || court === "Loading..." || cost === null || cost === "") return null;
  return `${court}|${cost}`;
}

/** Production's Create page on one chain, once the courts and the default cost (court 0, three votes) are loaded. */
export async function extractProductionCreate(page: Page, chainId: number): Promise<CreateSnapshot> {
  const screenPath = `${chainId.toString()}/create`;
  await page.goto(`${PROD_URL}/${screenPath}`);
  const url = recordedPageUrl(PROD_URL, screenPath);
  const settled = await waitUntilStable(page, () => productionCreateReady(page), CREATE_SETTLE_MS);
  const takenAt = nowSeconds();
  const available = (await page.locator(css("createForm", "createForm")).count()) > 0;
  const base = { screen: "create", app: "production", url, takenAt, settled, chain: chainId, unobservable: {} } as const;
  if (!available) return { ...base, available, courts: [], defaultCost: null, questionTypes: [], optionRange: null, validation: { requiredFields: [] } };
  const cost = /^([\d.]+)\s/.exec((await textOf(page.locator(css("createForm", "arbitrationFee")))) ?? "");
  const optionCount = page.locator("#numberOfRulingOptions");
  const min = integerOrNull(await attributeOf(optionCount, "min"));
  const max = integerOrNull(await attributeOf(optionCount, "max"));
  return {
    ...base,
    available,
    courts: await dropdownItems(page, "subcourt-dropdown"),
    defaultCost: etherToWei(cost?.[1] ?? null),
    questionTypes: await dropdownItems(page, "questionType"),
    optionRange: min === null || max === null ? null : [min, max],
    validation: { requiredFields: await productionRequiredFields(page) },
  };
}

function jsonStrings(value: string | null): string[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

/** The new app's Create page on one chain, once the courts and the default cost are loaded. */
export async function extractNewCreate(page: Page, chainId: number): Promise<CreateSnapshot> {
  const screenPath = `${chainId.toString()}/create`;
  await page.goto(`${NEW_URL}/${screenPath}`);
  const url = recordedPageUrl(NEW_URL, screenPath);
  const root = page.locator(byTestId("create-page"));
  const settled = await waitUntilStable(
    page,
    async () => {
      const available = await attributeOf(root, "data-available");
      if (available === "false") return available;
      const courts = await attributeOf(page.locator(byTestId("create-court")), "data-options");
      const cost = await attributeOf(page.locator(byTestId("create-cost")), "data-wei");
      return available === null || courts === null || cost === null ? null : `${courts}|${cost}`;
    },
    CREATE_SETTLE_MS,
  );
  const takenAt = nowSeconds();
  const optionCount = page.locator(byTestId("create-option-count"));
  const min = integerOrNull(await attributeOf(optionCount, "data-min"));
  const max = integerOrNull(await attributeOf(optionCount, "data-max"));
  const required = await page.locator('[data-field][data-required="true"]').evaluateAll((elements) => elements.map((element) => element.getAttribute("data-field") ?? ""));
  return {
    screen: "create",
    app: "new",
    url,
    takenAt,
    settled,
    chain: chainId,
    available: (await attributeOf(root, "data-available")) === "true",
    courts: jsonStrings(await attributeOf(page.locator(byTestId("create-court")), "data-options")),
    defaultCost: await attributeOf(page.locator(byTestId("create-cost")), "data-wei"),
    questionTypes: jsonStrings(await attributeOf(page.locator(byTestId("create-question-type")), "data-options")),
    optionRange: min === null || max === null ? null : [min, max],
    validation: { requiredFields: [...new Set(required)] },
    unobservable: {},
  };
}
