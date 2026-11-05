import { devices, expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { openDisputesRpc } from "../support/arbitrator";
import { fakeAtlas } from "../support/atlas";
import { accountButton, accountPanel, disputeCard, menuButton, navLink, networkMenu, pill } from "../support/header";
import { appOriginOf, fakeNetwork, loadRecording } from "../support/network";
import { expectWalletConnected, injectWallet } from "../support/wallet";

const ACCOUNT = "0x00000000000000000000000000000000000000e2";
const DISPUTE = 901n;
const ONGOING = /\/1\/ongoing$/;
const CASE_RECORDING = loadRecording(new URL("fixtures/mainnet-1621-appeal.json", import.meta.url));

interface OpenOptions {
  readonly phone: boolean;
  readonly wallet?: boolean;
  readonly width?: number;
}

async function newContext(browser: Browser, baseURL: string | undefined, { phone, wallet = false, width = 1440 }: OpenOptions): Promise<BrowserContext> {
  const origin = appOriginOf(baseURL);
  const context = await browser.newContext(phone ? { ...devices["Pixel 7"], baseURL: origin } : { baseURL: origin, viewport: { width, height: 800 } });
  if (wallet) await injectWallet(context, { account: ACCOUNT, chainId: 1 });
  return context;
}

async function openOngoing(browser: Browser, baseURL: string | undefined, options: OpenOptions): Promise<Page> {
  const context = await newContext(browser, baseURL, options);
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), rpc: openDisputesRpc([DISPUTE], 24_000_000n) });
  const page = await context.newPage();
  await page.goto("/1/ongoing");
  await expect(pill(page)).toBeVisible();
  await expect(disputeCard(page, DISPUTE)).toBeVisible({ timeout: 15_000 });
  if (options.wallet === true) await expectWalletConnected(accountButton(page));
  return page;
}

function periodFilter(page: Page) {
  return page.getByRole("button", { name: /period/i });
}

/** A point near one end of `locator`, clear of a menu panel that covers the other end. */
async function nearEnd(locator: Locator, end: "start" | "end"): Promise<{ readonly x: number; readonly y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("The target has no box on the page.");
  return { x: end === "start" ? 12 : box.width - 12, y: box.height / 2 };
}

/** Long enough for a late activation to land: react-aria presses a button itself 80 ms after a press that brought no click. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => new Promise((resolve) => setTimeout(resolve, 300)));
}

async function openDrawer(page: Page): Promise<void> {
  await menuButton(page).tap();
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(navLink(page, "Case Lookup")).toBeVisible();
}

test.describe("on a phone", () => {
  for (const row of [
    { menu: "network", wallet: false, opener: pill, panel: networkMenu, link: "Case Lookup", end: "end", url: /\/1\/cases$/ },
    { menu: "account", wallet: true, opener: accountButton, panel: accountPanel, link: "Create", end: "start", url: /\/1\/create$/ },
  ] as const) {
    test(`a tap on a drawer link while the ${row.menu} menu is open only closes the menu, and the next tap follows the link`, async ({ browser, baseURL }) => {
      const page = await openOngoing(browser, baseURL, { phone: true, wallet: row.wallet });
      await openDrawer(page);
      await row.opener(page).tap();
      await expect(row.panel(page)).toBeVisible();

      const link = navLink(page, row.link);
      await link.tap({ position: await nearEnd(link, row.end) });
      await expect(row.panel(page)).toBeHidden();
      await settle(page);
      await expect(page).toHaveURL(ONGOING);
      await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");

      await link.tap({ position: await nearEnd(link, row.end) });
      await expect(page).toHaveURL(row.url);
      await page.context().close();
    });
  }

  test("a tap on the drawer's scrim over a dispute card only closes the drawer, and the next tap opens the dispute", async ({ browser, baseURL }) => {
    const page = await openOngoing(browser, baseURL, { phone: true });
    await openDrawer(page);
    const drawer = await page.locator(`[id="${(await menuButton(page).getAttribute("aria-controls")) ?? ""}"]`).boundingBox();
    const card = await disputeCard(page, DISPUTE).boundingBox();
    if (drawer === null || card === null) throw new Error("The drawer or the dispute card has no box on the page.");
    const x = card.x + card.width / 2;
    const y = Math.max(card.y, drawer.y + drawer.height) + 16;
    expect(y, "the dispute card lies wholly under the drawer").toBeLessThan(card.y + card.height);
    const underFinger = await page.evaluate(({ px, py }) => document.elementFromPoint(px, py)?.closest("a, header") === null, { px: x, py: y });
    expect(underFinger, "the tap would land on the card itself, not on the scrim").toBe(true);

    await page.touchscreen.tap(x, y);
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await settle(page);
    await expect(page).toHaveURL(ONGOING);

    await disputeCard(page, DISPUTE).tap();
    await expect(page).toHaveURL(new RegExp(`/1/cases/${DISPUTE.toString()}$`));
    await page.context().close();
  });

  test("a tap on the header's theme toggle while the evidence modal is open only closes the modal", async ({ browser, baseURL }) => {
    const context = await newContext(browser, baseURL, { phone: true, wallet: true });
    await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), recordings: [CASE_RECORDING], atlas: fakeAtlas().answer });
    const page = await context.newPage();
    await page.goto("/1/cases/1621");
    await expectWalletConnected(accountButton(page));
    const evidence = page.getByRole("button", { name: "Evidence", exact: true });
    await expect(evidence).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("main [aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
    await evidence.tap();
    await expect(evidence).toHaveAttribute("aria-expanded", "true");
    const submit = page.getByRole("button", { name: "Submit New Evidence" });
    await expect(submit, "evidence cannot be submitted (the build needs REACT_APP_ATLAS_URI)").toBeEnabled({ timeout: 30_000 });
    await submit.tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The open modal hides the page from the accessibility tree, so the toggle is found by its markup.
    const toggle = page.locator("header button[aria-label^='Switch to']");
    const theme = await toggle.getAttribute("aria-label");
    const box = await toggle.boundingBox();
    if (box === null) throw new Error("The theme toggle has no box on the page.");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(dialog).toBeHidden();
    await settle(page);
    await expect(toggle).toHaveAttribute("aria-label", theme ?? "");
    await context.close();
  });
});

test.describe("with a mouse", () => {
  test("a click on a navigation link while the account menu is open only closes the menu, and the next click follows the link", async ({ browser, baseURL }) => {
    const page = await openOngoing(browser, baseURL, { phone: false, wallet: true });
    await accountButton(page).click();
    await expect(accountPanel(page)).toBeVisible();

    await navLink(page, "Case Lookup").click();
    await expect(accountPanel(page)).toBeHidden();
    await settle(page);
    await expect(page).toHaveURL(ONGOING);

    await navLink(page, "Case Lookup").click();
    await expect(page).toHaveURL(/\/1\/cases$/);
    await page.context().close();
  });

  test("a click on the Dispute ID field while the network menu is open only closes the menu without focusing the field, and the next click focuses it", async ({
    browser,
    baseURL,
  }) => {
    const context = await newContext(browser, baseURL, { phone: false });
    await fakeNetwork(context, { appOrigin: appOriginOf(baseURL) });
    const page = await context.newPage();
    await page.goto("/1/cases");
    const field = page.getByRole("searchbox", { name: "Dispute ID" });
    await expect(field).toBeVisible();
    await pill(page).click();
    await expect(networkMenu(page)).toBeVisible();

    await field.click({ position: await nearEnd(field, "start") });
    await expect(networkMenu(page)).toBeHidden();
    await settle(page);
    await expect(field).not.toBeFocused();

    await field.click();
    await expect(field).toBeFocused();
    await context.close();
  });

  test("a drag across the page title while the network menu is open closes the menu and still selects the title", async ({ browser, baseURL }) => {
    const page = await openOngoing(browser, baseURL, { phone: false });
    await pill(page).click();
    await expect(networkMenu(page)).toBeVisible();

    const title = await page.getByRole("heading", { level: 1 }).boundingBox();
    if (title === null) throw new Error("The page title has no box on the page.");
    await page.mouse.move(title.x + 2, title.y + title.height / 2);
    await page.mouse.down();
    await page.mouse.move(title.x + title.width - 2, title.y + title.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(networkMenu(page)).toBeHidden();
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toContain("Ongoing");
    await page.context().close();
  });

  test("a click on the Period filter while the network menu is open only closes the menu, and the next click opens the filter", async ({ browser, baseURL }) => {
    const page = await openOngoing(browser, baseURL, { phone: false });
    await pill(page).click();
    await expect(networkMenu(page)).toBeVisible();

    // The menu can cover the filter's near end.
    await periodFilter(page).click({ position: await nearEnd(periodFilter(page), "end") });
    await expect(networkMenu(page)).toBeHidden();
    await settle(page);
    await expect(page.getByRole("listbox")).toHaveCount(0);

    await periodFilter(page).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.context().close();
  });

  test("a click on a dispute card while the menu card is open only closes the card, and the next click opens the dispute", async ({ browser, baseURL }) => {
    const page = await openOngoing(browser, baseURL, { phone: false, width: 1024 });
    await menuButton(page).click();
    await expect(navLink(page, "Case Lookup")).toBeVisible();

    await disputeCard(page, DISPUTE).click();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await settle(page);
    await expect(page).toHaveURL(ONGOING);

    await disputeCard(page, DISPUTE).click();
    await expect(page).toHaveURL(new RegExp(`/1/cases/${DISPUTE.toString()}$`));
    await page.context().close();
  });
});
