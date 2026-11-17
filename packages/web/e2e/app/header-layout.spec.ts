import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { accountButton, accountPanel, connectButton, header, menuButton, navLink, pill, themeToggle } from "../support/header";
import { fakeNetwork } from "../support/network";
import { expectNoSidewaysScroll } from "../support/pageScroll";
import { expectWalletConnected, injectWallet, type InjectedWalletOptions } from "../support/wallet";

// No chain read needs an answer: only the frame is measured.

const ACCOUNT = "0x00000000000000000000000000000000000000e2";
const HEIGHT = 800;
const BAR_HEIGHT = 64;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${what} has no box on the page.`);
  return box;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The bar's row: the element that holds the brand, the Menu button, the menu panel and the controls. */
function barRow(page: Page) {
  return header(page).getByRole("link", { name: "Kleros Dispute Resolver" }).locator("..");
}

async function expectFullPillName(page: Page, name: string): Promise<void> {
  await expect(pill(page)).toHaveAccessibleName(`Network: ${name}. Change network`);
  const label = pill(page).getByText(name, { exact: true });
  await expect(label).toBeVisible();
  const cut = await label.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(cut, `the pill cuts "${name}" short`).toBe(false);
}

/**
 * Resolves once the header has gone 750 ms without a change. While AppKit loads, the wallet control flips to Connecting
 * and back a few times, with or without a wallet, and a measurement taken during a flip sees the wider Connecting button.
 */
async function waitForSettledHeader(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        const header = document.querySelector("header");
        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(settle, 750);
        });
        let timer = setTimeout(settle, 750);
        const cap = setTimeout(settle, 10_000);
        function settle() {
          observer.disconnect();
          clearTimeout(timer);
          clearTimeout(cap);
          resolve();
        }
        if (header !== null) observer.observe(header, { subtree: true, childList: true, characterData: true, attributes: true });
      }),
  );
}

async function openPage(browser: Browser, baseURL: string | undefined, path: string, wallet?: InjectedWalletOptions): Promise<Page> {
  const appUrl = new URL(baseURL ?? "http://localhost");
  const context = await browser.newContext({ baseURL: appUrl.origin, viewport: { width: 1440, height: HEIGHT } });
  if (wallet !== undefined) await injectWallet(context, wallet);
  await fakeNetwork(context, { appOrigin: appUrl.origin });
  const page = await context.newPage();
  await page.goto(path);
  await expect(pill(page)).toBeVisible();
  if (wallet !== undefined) await expectWalletConnected(accountButton(page));
  await waitForSettledHeader(page);
  return page;
}

async function visibleBarParts(page: Page, walletControl: Locator): Promise<[string, Locator][]> {
  const parts: [string, Locator][] = [
    ["the brand", header(page).getByRole("link", { name: "Kleros Dispute Resolver" })],
    ["the network pill", pill(page)],
    ["the theme toggle", themeToggle(page)],
    ["the wallet control", walletControl],
  ];
  const menu = menuButton(page);
  if (await menu.isVisible()) parts.push(["the Menu button", menu]);
  for (const name of ["Ongoing Disputes", "Case Lookup", "Create"]) {
    const link = navLink(page, name);
    if (await link.isVisible()) parts.push([`the ${name} link`, link]);
  }
  return parts;
}

async function expectPairwiseDisjoint(parts: readonly [string, Locator][], at: string): Promise<void> {
  const boxes = await Promise.all(parts.map(async ([name, locator]) => [name, await boxOf(locator, name)] as const));
  for (const [index, [name, box]] of boxes.entries()) {
    for (const [otherName, other] of boxes.slice(index + 1)) expect(overlaps(box, other), `${name} overlaps ${otherName} ${at}`).toBe(false);
  }
}

async function expectOneRowBar(page: Page, walletControl: Locator, label: string): Promise<void> {
  for (const width of [900, 1024, 1279, 1280, 1440]) {
    await page.setViewportSize({ width, height: HEIGHT });
    const at = `at ${String(width)} px ${label}`;
    expect((await boxOf(barRow(page), "the bar row")).height, `the bar row's height ${at}`).toBeCloseTo(BAR_HEIGHT, 0);
    const parts = await visibleBarParts(page, walletControl);
    expect(parts.length, `neither the nav nor the Menu button shows ${at}`).toBeGreaterThanOrEqual(5);
    await expectPairwiseDisjoint(parts, at);
    await expectNoSidewaysScroll(page, width);
  }
  await page.context().close();
}

test("from 900 px the header bar is one 64 px row and none of its controls overlap, with or without a wallet", async ({ browser, baseURL }) => {
  const withoutWallet = await openPage(browser, baseURL, "/1/ongoing");
  await expectOneRowBar(withoutWallet, connectButton(withoutWallet), "without a wallet");
  const withWallet = await openPage(browser, baseURL, "/1/ongoing", { account: ACCOUNT, chainId: 1 });
  await expectOneRowBar(withWallet, accountButton(withWallet), "with a wallet");
});

test("a long testnet name truncates in the pill without touching the theme toggle at any width from 320 px", async ({ browser, baseURL }) => {
  const page = await openPage(browser, baseURL, "/11155111/ongoing");
  await expect(pill(page), "the pill does not read Sepolia (the build needs the Sepolia read RPC)").toHaveAccessibleName("Network: Ethereum Testnet Sepolia. Change network");
  for (const width of [320, 375, 414, 768, 900, 1280]) {
    await page.setViewportSize({ width, height: HEIGHT });
    const pillBox = await boxOf(pill(page), "the network pill");
    const toggleBox = await boxOf(themeToggle(page), "the theme toggle");
    expect(pillBox.x + pillBox.width, `the pill runs into the theme toggle at ${String(width)} px`).toBeLessThanOrEqual(toggleBox.x);
    await expect(pill(page)).toHaveAccessibleName("Network: Ethereum Testnet Sepolia. Change network");
    await expectNoSidewaysScroll(page, width);
  }
  await page.context().close();
});

test("with a wallet connected at 320 px the pill, the theme toggle and the account pill stay inside the screen without covering each other", async ({ browser, baseURL }) => {
  const page = await openPage(browser, baseURL, "/1/ongoing", { account: ACCOUNT, chainId: 1 });
  await page.setViewportSize({ width: 320, height: HEIGHT });
  const parts: [string, Locator][] = [
    ["the network pill", pill(page)],
    ["the theme toggle", themeToggle(page)],
    ["the account pill", accountButton(page)],
  ];
  await expectPairwiseDisjoint(parts, "at 320 px");
  for (const [name, locator] of parts) {
    const box = await boxOf(locator, name);
    expect(box.x, `${name} starts off the left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} runs off the right edge`).toBeLessThanOrEqual(320);
  }
  await expect(pill(page)).toHaveAccessibleName("Network: Ethereum Mainnet. Change network");
  await expectNoSidewaysScroll(page, 320);
  await page.context().close();
});

test("the open account panel stays on screen and the page does not scroll sideways on 320 and 375 px phones", async ({ browser, baseURL }) => {
  const page = await openPage(browser, baseURL, "/1/ongoing", { account: ACCOUNT, chainId: 1 });
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: HEIGHT });
    const at = `at ${String(width)} px`;
    await accountButton(page).click();
    const panel = accountPanel(page);
    await expect(panel.getByText(/^Wallet network: /)).toBeVisible();
    const box = await boxOf(panel, "the account panel");
    expect(box.x, `the account panel starts off the left edge ${at}`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `the account panel runs off the right edge ${at}`).toBeLessThanOrEqual(width);
    await expectNoSidewaysScroll(page, width);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  }
  await page.context().close();
});

test("at 375 px with a wallet connected the pill shows each switchable chain's full name beside the compact account pill", async ({ browser, baseURL }) => {
  for (const [chainId, name] of [
    [1, "Ethereum Mainnet"],
    [100, "Gnosis Network"],
  ] as const) {
    const page = await openPage(browser, baseURL, `/${String(chainId)}/ongoing`, { account: ACCOUNT, chainId });
    await page.setViewportSize({ width: 375, height: HEIGHT });
    await expectFullPillName(page, name);
    await expect(accountButton(page).getByText(/^0x/), "the account pill shows the address on a phone").toBeHidden();
    const pillBox = await boxOf(pill(page), "the network pill");
    const accountBox = await boxOf(accountButton(page), "the account button");
    expect(accountBox.height, "the account pill is not as tall as the network pill").toBeCloseTo(pillBox.height, 0);
    expect(overlaps(pillBox, accountBox), "the account pill covers the network pill").toBe(false);
    await expectNoSidewaysScroll(page, 375);
    await page.context().close();
  }
});
