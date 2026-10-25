import { expect, test, type Frame, type Locator, type Page } from "@playwright/test";
import { CASE_PATH, expectConfiguredBuild, routeCasePage, type DisplayPage, type Traffic } from "./casePageRoutes";
import { expectCaseSectionsSettled } from "./caseSections";

// The case page's evidence display in every engine the runner projects name, with a display page the test owns: the
// meta-evidence names it and the gateway route serves it, so no real third-party display is ever visited. Nothing the
// frame's source carries (the gateway origin, the read RPC) is written to the report: every check on it is a boolean.

/** A content-addressed path the app serves through its gateway; the route answers it with `DISPLAY_HTML`. */
const DISPLAY_PATH = "/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html";

const FULL_PX = 360;

/** One link near the top of the frame and one near its bottom; the page counts every message it receives. */
const DISPLAY_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture display</title><style>
html, body { margin: 0; }
a { position: absolute; left: 16px; display: block; height: 20px; line-height: 20px; }
#above { top: 40px; }
#below { top: 300px; }
</style></head><body>
<a id="above" href="#above">Link near the top</a>
<a id="below" href="#below">Link near the bottom</a>
<script>
var receivedMessages = 0;
window.addEventListener("message", function () { receivedMessages += 1; });
</script>
</body></html>`;

const FRAME = 'iframe[title="Evidence display"]';

function display(release?: Promise<void>): DisplayPage {
  return { path: DISPLAY_PATH, html: DISPLAY_HTML, release };
}

function row(page: Page): Locator {
  return page.getByRole("button", { name: "Evidence display", exact: true });
}

function frameElement(page: Page): Locator {
  return page.locator(FRAME);
}

/** The box the frame is shown in, which draws the inset ring while keyboard focus is inside the frame. */
function displayWindow(page: Page): Locator {
  return page.locator(".dr-display-window");
}

/** The element the row's aria-controls names: the region the row hides. */
async function displayRegion(page: Page): Promise<Locator> {
  const id = await row(page).getAttribute("aria-controls");
  expect(id, "the row names the region it controls").toBeTruthy();
  return page.locator(`[id="${id ?? ""}"]`);
}

async function height(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  return box?.height ?? Number.NaN;
}

/** The text a sighted reader sees in the region: text in boxes larger than the 1 px of a screen-reader-only element. */
async function visibleText(region: Locator): Promise<string> {
  return region.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text = "";
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (parent === null || getComputedStyle(parent).visibility !== "visible") continue;
      const box = parent.getBoundingClientRect();
      if (box.width > 1 && box.height > 1) text += node.textContent ?? "";
    }
    return text.trim();
  });
}

/** Reloads the case page and waits until the display has loaded again and no section is loading. */
async function reopen(page: Page, traffic: Traffic): Promise<void> {
  const requested = traffic.display;
  await page.reload();
  await expect.poll(() => traffic.display, { message: "the display page was not requested again" }).toBeGreaterThan(requested);
  await expectCaseSectionsSettled(page);
}

/** Opens the case page with the fixture display and waits until it has loaded and no section is loading. */
async function openWithDisplay(page: Page, baseURL: string | undefined): Promise<Traffic> {
  const traffic = await routeCasePage(page, baseURL, {}, { display: display() });
  await page.goto(CASE_PATH);
  await expectConfiguredBuild(traffic);
  await expect.poll(() => traffic.display, { message: "the display page was never requested" }).toBeGreaterThan(0);
  await expectCaseSectionsSettled(page);
  return traffic;
}

/** The fixture display's frame; the test owns its page, so it may read it. */
async function fixtureFrame(page: Page): Promise<Frame> {
  const frame = await (await frameElement(page).elementHandle()).contentFrame();
  if (frame === null) throw new Error("The evidence display has no frame.");
  return frame;
}

/** Whether the focused element of the main document is the evidence-display iframe. */
async function focusIsOnTheFrame(page: Page): Promise<boolean> {
  return page.evaluate((selector) => document.activeElement === document.querySelector(selector), FRAME);
}

/** Tabs from the element before the row onto the row. */
async function tabToTheRow(page: Page): Promise<void> {
  await row(page).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(row(page)).not.toBeFocused();
  await page.keyboard.press("Tab");
  await expect(row(page)).toBeFocused();
}

/** Tabs from the focused row into the frame, until its first link has focus. */
async function tabFromTheRowIntoTheFrame(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  expect(await focusIsOnTheFrame(page), "the Tab after the row enters the frame").toBe(true);
  const above = page.frameLocator(FRAME).locator("#above");
  // An engine may stop once on the frame's document before its first link.
  if (!(await above.evaluate((link) => link === document.activeElement))) await page.keyboard.press("Tab");
  await expect(above).toBeFocused();
}

/** Shift+Tabs back to the row; an engine may stop on the frame's document on the way out. */
async function shiftTabToTheRow(page: Page): Promise<void> {
  for (let presses = 0; presses < 4; presses += 1) {
    await page.keyboard.press("Shift+Tab");
    if (await row(page).evaluate((button) => button === document.activeElement)) return;
  }
  await expect(row(page)).toBeFocused();
}

/** Counts, never values: where the frame's source appears in the display block and the document's text. */
async function sourceExposure(page: Page) {
  return page.evaluate((selector) => {
    const frame = document.querySelector(selector);
    const src = frame?.getAttribute("src") ?? "";
    const query = src.slice(src.indexOf("?") + 1);
    let block = frame?.parentElement ?? null;
    while (block !== null && block.querySelector("button[aria-controls]") === null) block = block.parentElement;
    const elements = block === null ? [] : [block, ...block.querySelectorAll("*")];
    const carriesSource = (value: string) => value.includes(src) || value.includes(query);
    const leaking = elements.flatMap((element) =>
      [...element.attributes].filter((attribute) => !(element === frame && attribute.name === "src") && carriesSource(attribute.value)),
    );
    return {
      hasSource: src.length > 0 && query.length > 0,
      blockFound: block !== null,
      srcAttributes: elements.filter((element) => element.hasAttribute("src")).length,
      leakingAttributes: leaking.length,
      sourceInText: carriesSource(document.body.textContent),
    };
  }, FRAME);
}

const NO_EXPOSURE = { hasSource: true, blockFound: true, srcAttributes: 1, leakingAttributes: 0, sourceInText: false };

/**
 * The window's computed outline, and whether its colour is the one --dr-display-focus names. Both colours are compared
 * through a detached canvas, which writes any CSS colour in one notation, so nothing is added to the page.
 */
async function windowRing(window: Locator) {
  return window.evaluate((element) => {
    const style = getComputedStyle(element);
    const context = document.createElement("canvas").getContext("2d");
    const normalized = (color: string) => {
      if (context === null) return `unnormalized ${color}`;
      context.fillStyle = color;
      return context.fillStyle;
    };
    const focusColor = getComputedStyle(document.documentElement).getPropertyValue("--dr-display-focus").trim();
    return {
      style: style.outlineStyle,
      width: style.outlineWidth,
      offset: style.outlineOffset,
      colorIsDisplayFocus: focusColor !== "" && normalized(style.outlineColor) === normalized(focusColor),
    };
  });
}

const INSET_RING = { style: "solid", width: "2px", offset: "-2px", colorIsDisplayFocus: true };

/** The light theme's 1 px edge on the window at rest, which no focus ring has replaced. */
const LIGHT_EDGE = { style: "solid", width: "1px", offset: "-1px", colorIsDisplayFocus: false };

test.describe("case page evidence display", () => {
  test("the whole frame is shown by default, and the row hides it completely and shows it again without reloading it", async ({ page, baseURL }) => {
    const traffic = await openWithDisplay(page, baseURL);
    const frame = frameElement(page);
    const region = await displayRegion(page);
    await expect(row(page)).toHaveAttribute("aria-expanded", "true");
    await expect(frame).toBeVisible();
    expect(await height(displayWindow(page))).toBeCloseTo(FULL_PX, 0);
    expect(await height(frame)).toBeCloseTo(FULL_PX, 0);
    await expect(page.getByRole("button", { name: /^(Show full frame|Show less)$/ })).toHaveCount(0);
    const handle = await frame.elementHandle();
    const srcBefore = await frame.getAttribute("src");

    await row(page).click();
    await expect(row(page)).toHaveAttribute("aria-expanded", "false");
    await expect(region).toBeHidden();
    await expect(frame).toBeHidden();
    await expect(row(page)).toBeVisible();

    await row(page).click();
    await expect(row(page)).toHaveAttribute("aria-expanded", "true");
    await expect(frame).toBeVisible();
    expect(await height(displayWindow(page))).toBeCloseTo(FULL_PX, 0);
    expect(await frame.evaluate((element, before) => element === before, handle), "the same iframe element").toBe(true);
    expect((await frame.getAttribute("src")) === srcBefore, "the src attribute is unchanged").toBe(true);
    expect(traffic.display, "the display page loaded once, not again on hiding and showing").toBe(1);
  });

  test("the section skeleton holds the frame's place until the page loads, with no visible text and no way into the frame", async ({ page, baseURL }) => {
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const traffic = await routeCasePage(page, baseURL, {}, { display: display(released) });
    await page.goto(CASE_PATH);
    await expectConfiguredBuild(traffic);
    await expect.poll(() => traffic.display, { message: "the display page was never requested" }).toBeGreaterThan(0);

    // The gateway holds the page, so the frame has not loaded yet.
    const region = await displayRegion(page);
    const skeleton = displayWindow(page).locator(".animate-loading");
    const status = region.getByRole("status");
    await expect(status).toHaveText("Loading…");
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Loading…" })).toHaveCount(1);
    await expect(skeleton.first()).toBeVisible();
    await expect(frameElement(page)).toBeHidden();
    expect(await height(displayWindow(page))).toBeCloseTo(FULL_PX, 0);
    expect(await visibleText(region), "visible text in the loading display").toBe("");
    await tabToTheRow(page);
    await page.keyboard.press("Tab");
    expect(await focusIsOnTheFrame(page), "the Tab after the row passes the loading frame by").toBe(false);

    release();
    await expect(status).toHaveCount(0);
    await expect(skeleton).toHaveCount(0);
    await expect(frameElement(page)).toBeVisible();
    expect(await height(displayWindow(page))).toBeCloseTo(FULL_PX, 0);
    await expectCaseSectionsSettled(page);
    await tabToTheRow(page);
    await tabFromTheRowIntoTheFrame(page);
  });

  test("keyboard focus reaches the row before the frame, and every link of the frame is reachable inside the window", async ({ page, baseURL }) => {
    await openWithDisplay(page, baseURL);
    const below = page.frameLocator(FRAME).locator("#below");

    await tabToTheRow(page);
    await tabFromTheRowIntoTheFrame(page);
    await page.keyboard.press("Tab");
    await expect(below).toBeFocused();
    const [link, window] = await Promise.all([below.boundingBox(), displayWindow(page).boundingBox()]);
    expect(link !== null && window !== null && link.y + link.height <= window.y + window.height, "the focused link lies inside the window").toBe(true);

    await shiftTabToTheRow(page);
    await expect(row(page)).toHaveAttribute("aria-expanded", "true");
  });

  test("hiding the display while focus is inside the frame moves focus to the row", async ({ page, baseURL }) => {
    await openWithDisplay(page, baseURL);
    await tabToTheRow(page);
    await tabFromTheRowIntoTheFrame(page);

    // A screen reader's activation: a click that does not move focus first.
    await row(page).dispatchEvent("click");
    await expect(row(page)).toHaveAttribute("aria-expanded", "false");
    await expect(frameElement(page)).toBeHidden();
    await expect(row(page)).toBeFocused();
  });

  test("a pointer click inside the frame draws no ring", async ({ page, baseURL, browserName }) => {
    await openWithDisplay(page, baseURL);
    const window = displayWindow(page);
    const resting = await windowRing(window);
    expect(resting, "the light window's resting edge").toEqual(LIGHT_EDGE);

    await page.frameLocator(FRAME).locator("#above").click();
    await expect.poll(() => focusIsOnTheFrame(page), { message: "the click puts focus inside the frame" }).toBe(true);
    const ring = await windowRing(window);
    test.info().annotations.push({
      type: "pointer click inside the frame",
      description: `${browserName}: the window's outline is ${ring.width} ${ring.style} after a click on a link of the frame`,
    });
    expect.soft(ring, "the window's outline after a pointer click inside the frame").toEqual(resting);
    expect(await height(window)).toBeCloseTo(FULL_PX, 0);
  });

  test("the frame never receives a message and never exposes its source", async ({ page, baseURL }) => {
    await openWithDisplay(page, baseURL);
    expect(await sourceExposure(page), "after load").toEqual(NO_EXPOSURE);

    await row(page).click();
    await expect(row(page)).toHaveAttribute("aria-expanded", "false");
    expect(await sourceExposure(page), "after hiding").toEqual(NO_EXPOSURE);

    await row(page).click();
    await expect(row(page)).toHaveAttribute("aria-expanded", "true");
    expect(await sourceExposure(page), "after showing").toEqual(NO_EXPOSURE);

    const frame = await fixtureFrame(page);
    expect(await frame.evaluate(() => Number(Reflect.get(globalThis, "receivedMessages"))), "messages the display page received").toBe(0);
  });

  test("the row's fill eases on the hover clock, the skeleton fades on the reveal clock while the frame never fades, and reduced motion removes every fade and the fold", async ({
    page,
    baseURL,
  }) => {
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const traffic = await routeCasePage(page, baseURL, {}, { display: display(released) });
    await page.goto(CASE_PATH);
    await expectConfiguredBuild(traffic);
    await expect.poll(() => traffic.display, { message: "the display page was never requested" }).toBeGreaterThan(0);

    // The gateway holds the page, so the skeleton covers the frame's place.
    const region = await displayRegion(page);
    const holder = frameElement(page).locator("..");
    const cover = displayWindow(page).locator(":scope > [aria-hidden='true']");
    await expect(cover.locator(".animate-loading").first()).toBeVisible();
    const motion = (locator: Locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return { property: style.transitionProperty, duration: style.transitionDuration, easing: style.transitionTimingFunction };
      });
    const frameFade = (locator: Locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, duration: style.transitionDuration };
      });
    const NO_FADE = { opacity: "1", duration: "0s" };
    expect(await motion(row(page))).toEqual({ property: "background-color", duration: "0.15s", easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    expect(await motion(cover)).toEqual({ property: "opacity", duration: "0.4s", easing: "ease-in-out" });
    expect(await frameFade(holder), "the frame's holder before the page loads").toEqual(NO_FADE);
    expect((await motion(region)).property).toBe("grid-template-rows, opacity");

    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await motion(row(page))).property).toBe("none");
    expect((await motion(cover)).property).toBe("none");
    expect((await motion(region)).property).toBe("none");

    release();
    await expect(cover).toHaveCount(0);
    await expect(frameElement(page)).toBeVisible();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(await frameFade(holder), "the frame's holder once the page has loaded").toEqual(NO_FADE);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expectCaseSectionsSettled(page);
    await row(page).click();
    await expect(region).toBeHidden();
    await row(page).click();
    await expect(frameElement(page)).toBeVisible();
    expect(await height(displayWindow(page))).toBeCloseTo(FULL_PX, 0);
  });

  test("the inset ring is four-sided in both themes", async ({ page, baseURL }) => {
    const traffic = await openWithDisplay(page, baseURL);
    const html = page.locator("html");

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      // A fresh page for each theme: once focus had left the frame by keyboard, Firefox kept the next Tabs on the frame.
      await reopen(page, traffic);
      if (colorScheme === "dark") await expect(html).toHaveClass(/\bdark\b/);
      else await expect(html).not.toHaveClass(/\bdark\b/);
      await tabToTheRow(page);
      await tabFromTheRowIntoTheFrame(page);
      // The window is marked a tick after the Tab, so the ring is polled rather than read once.
      await expect
        .configure({ soft: true })
        .poll(() => windowRing(displayWindow(page)), { message: colorScheme })
        .toEqual(INSET_RING);
      expect.soft(await frameElement(page).evaluate((element) => getComputedStyle(element).outlineStyle), `${colorScheme}: the frame draws no ring of its own`).toBe("none");
    }
  });
});
