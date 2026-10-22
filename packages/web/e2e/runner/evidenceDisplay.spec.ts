import { expect, test, type Frame, type Locator, type Page } from "@playwright/test";
import { CASE_PATH, expectConfiguredBuild, routeCasePage, type DisplayPage, type Traffic } from "./casePageRoutes";
import { expectCaseSectionsSettled } from "./caseSections";

// The case page's evidence display in every engine the runner projects name, with a display page the test owns: the
// meta-evidence names it and the gateway route serves it, so no real third-party display is ever visited. Nothing the
// frame's source carries (the gateway origin, the read RPC) is written to the report: every check on it is a boolean.

/** A content-addressed path the app serves through its gateway; the route answers it with `DISPLAY_HTML`. */
const DISPLAY_PATH = "/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html";

const COLLAPSED_PX = 256;
const FULL_PX = 360;

/**
 * One link in the top 100 px of the frame and one at y = 300, below the collapsed window's cut; the page counts every
 * message it receives.
 */
const DISPLAY_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture display</title><style>
html, body { margin: 0; }
a { position: absolute; left: 16px; display: block; height: 20px; line-height: 20px; }
#above { top: 40px; }
#below { top: 300px; }
</style></head><body>
<a id="above" href="#above">Link above the cut</a>
<a id="below" href="#below">Link below the cut</a>
<script>
var receivedMessages = 0;
window.addEventListener("message", function () { receivedMessages += 1; });
</script>
</body></html>`;

const FRAME = 'iframe[title="Evidence display"]';
const CONTROL_NAME = /^(Show full frame|Show less)$/;

function display(release?: Promise<void>): DisplayPage {
  return { path: DISPLAY_PATH, html: DISPLAY_HTML, release };
}

function control(page: Page): Locator {
  return page.getByRole("button", { name: CONTROL_NAME });
}

function frameElement(page: Page): Locator {
  return page.locator(FRAME);
}

/** The element the control's aria-controls names: the window the frame is shown through. */
async function displayWindow(page: Page): Promise<Locator> {
  const id = await control(page).getAttribute("aria-controls");
  expect(id, "the control names the window it controls").toBeTruthy();
  return page.locator(`[id="${id ?? ""}"]`);
}

/** The innermost block that holds both the control and the frame. */
function displayBlock(page: Page): Locator {
  return page.locator("div").filter({ has: control(page) }).filter({ has: frameElement(page) }).last();
}

async function height(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  return box?.height ?? Number.NaN;
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

/** Tabs from the element before the control onto the control. */
async function tabToTheControl(page: Page): Promise<void> {
  await control(page).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(control(page)).not.toBeFocused();
  await page.keyboard.press("Tab");
  await expect(control(page)).toBeFocused();
}

/** Tabs from the element before the control onto the control, then into the frame, until its first link has focus. */
async function tabIntoTheFrame(page: Page): Promise<void> {
  await tabToTheControl(page);
  await tabFromTheControlIntoTheFrame(page);
}

/** Tabs from the focused control into the frame, until its first link has focus. */
async function tabFromTheControlIntoTheFrame(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  expect(await focusIsOnTheFrame(page), "the Tab after the control enters the frame").toBe(true);
  const above = page.frameLocator(FRAME).locator("#above");
  // An engine may stop once on the frame's document before its first link.
  if (!(await above.evaluate((link) => link === document.activeElement))) await page.keyboard.press("Tab");
  await expect(above).toBeFocused();
}

/** Shift+Tabs back to the control; an engine may stop on the frame's document on the way out. */
async function shiftTabToControl(page: Page): Promise<void> {
  for (let presses = 0; presses < 4; presses += 1) {
    await page.keyboard.press("Shift+Tab");
    if (await control(page).evaluate((button) => button === document.activeElement)) return;
  }
  await expect(control(page)).toBeFocused();
}

/** Resolves once the window's height has stopped changing: two frames for a transition to start, then its end. */
async function settled(window: Locator): Promise<void> {
  await window.evaluate(async (element) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  });
}

/** Whether `inner` lies entirely inside the window's box. */
async function liesInside(inner: Locator, outer: Locator): Promise<boolean> {
  const [box, frame] = await Promise.all([inner.boundingBox(), outer.boundingBox()]);
  if (box === null || frame === null) return false;
  return box.y >= frame.y && box.y + box.height <= frame.y + frame.height && box.x >= frame.x && box.x + box.width <= frame.x + frame.width;
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
    const leaking = elements.flatMap((element) => [...element.attributes].filter((attribute) => !(element === frame && attribute.name === "src") && carriesSource(attribute.value)));
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

test.describe("case page evidence display", () => {
  test("the evidence display is collapsed by default and the full frame opens on the control", async ({ page, baseURL }) => {
    const traffic = await openWithDisplay(page, baseURL);
    const window = await displayWindow(page);
    const frame = frameElement(page);
    await expect(control(page)).toHaveText("Show full frame");
    await expect(control(page)).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => height(window)).toBeCloseTo(COLLAPSED_PX, 0);
    expect(await height(frame)).toBeCloseTo(FULL_PX, 0);
    const handle = await frame.elementHandle();
    const srcBefore = await frame.getAttribute("src");

    await control(page).click();
    await expect(control(page)).toHaveText("Show less");
    await expect(control(page)).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => height(window)).toBeCloseTo(FULL_PX, 0);
    expect(await height(frame)).toBeCloseTo(FULL_PX, 0);
    expect(await frame.evaluate((element, before) => element === before, handle), "the same iframe element").toBe(true);
    expect((await frame.getAttribute("src")) === srcBefore, "the src attribute is unchanged").toBe(true);
    expect(traffic.display, "the display page loaded once, not again on the toggle").toBe(1);
  });

  test("the loading status clears when the page loads", async ({ page, baseURL }) => {
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const traffic = await routeCasePage(page, baseURL, {}, { display: display(released) });
    await page.goto(CASE_PATH);
    await expectConfiguredBuild(traffic);
    await expect.poll(() => traffic.display, { message: "the display page was never requested" }).toBeGreaterThan(0);

    // The gateway holds the page, so the frame has not loaded yet.
    const status = displayBlock(page).getByRole("status");
    await expect(status).toHaveText("Loading…");
    await expect(page.getByRole("main").getByRole("status").filter({ hasText: "Loading…" })).toHaveCount(1);

    release();
    await expect(status).toHaveCount(0);
    await expectCaseSectionsSettled(page);
  });

  test("keyboard focus reaches the control before the frame, and a focused link below the cut opens the window instead of hiding", async ({ page, baseURL, browserName }) => {
    await openWithDisplay(page, baseURL);
    const window = await displayWindow(page);
    const below = page.frameLocator(FRAME).locator("#below");

    await tabIntoTheFrame(page);
    await page.keyboard.press("Tab");
    await expect(below).toBeFocused();
    await expect(control(page)).toHaveAttribute("aria-expanded", "false");
    await settled(window);
    const inside = await liesInside(below, window);
    const focusedHeight = Math.round(await height(window));
    // Recorded before the assertions, so the report carries each engine's fact whether or not the window opened.
    test.info().annotations.push({
      type: "focus below the cut while collapsed",
      description: `${browserName}: the focused link at y = 300 is ${inside ? "inside" : "hidden below"} the window (${String(focusedHeight)} px) while the control reads "Show full frame"`,
    });
    // Keyboard focus inside the frame opens the window to the full frame, so the focused link is never below the cut.
    expect.soft(inside, "the focused link lies inside the window").toBe(true);
    expect.soft(focusedHeight, "the window's height while focus is in the frame").toBe(FULL_PX);

    // Focus back on the control: the window returns to the cut and the link lies below it again.
    await shiftTabToControl(page);
    await expect.poll(() => height(window)).toBeCloseTo(COLLAPSED_PX, 0);
    expect(await liesInside(below, window)).toBe(false);

    await page.keyboard.press("Enter");
    await expect(control(page)).toHaveText("Show less");
    await expect.poll(() => liesInside(below, window)).toBe(true);
  });

  test("a pointer click inside the frame leaves the window at the cut and draws no ring", async ({ page, baseURL, browserName }) => {
    await openWithDisplay(page, baseURL);
    const window = await displayWindow(page);

    await page.frameLocator(FRAME).locator("#above").click();
    await expect.poll(() => focusIsOnTheFrame(page), { message: "the click puts focus inside the frame" }).toBe(true);
    await expect(control(page)).toHaveAttribute("aria-expanded", "false");
    await settled(window);
    const clickedHeight = Math.round(await height(window));
    const ring = await windowRing(window);
    test.info().annotations.push({
      type: "pointer click inside the frame while collapsed",
      description: `${browserName}: the window is ${String(clickedHeight)} px with outline style ${ring.style} after a click on the link above the cut`,
    });
    expect.soft(clickedHeight, "the window's height after a pointer click inside the frame").toBeCloseTo(COLLAPSED_PX, 0);
    expect.soft(ring.style, "the window's outline after a pointer click inside the frame").toBe("none");
  });

  test("the frame never receives a message and never exposes its source", async ({ page, baseURL }) => {
    await openWithDisplay(page, baseURL);
    expect(await sourceExposure(page), "after load").toEqual(NO_EXPOSURE);

    await control(page).click();
    await expect(control(page)).toHaveText("Show less");
    expect(await sourceExposure(page), "after Show full frame").toEqual(NO_EXPOSURE);

    await control(page).click();
    await expect(control(page)).toHaveText("Show full frame");
    expect(await sourceExposure(page), "after Show less").toEqual(NO_EXPOSURE);

    const frame = await fixtureFrame(page);
    expect(await frame.evaluate(() => Number(Reflect.get(globalThis, "receivedMessages"))), "messages the display page received").toBe(0);
  });

  test("the inset ring is four-sided in both states", async ({ page, baseURL }) => {
    const traffic = await openWithDisplay(page, baseURL);
    const html = page.locator("html");

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const expanded of [false, true]) {
        // A fresh page for each state: once focus had left the frame by keyboard, Firefox kept the next Tabs on the frame.
        await reopen(page, traffic);
        if (colorScheme === "dark") await expect(html).toHaveClass(/\bdark\b/);
        else await expect(html).not.toHaveClass(/\bdark\b/);
        await tabToTheControl(page);
        if (expanded) await page.keyboard.press("Enter");
        await expect(control(page)).toHaveAttribute("aria-expanded", String(expanded));
        await tabFromTheControlIntoTheFrame(page);
        const window = await displayWindow(page);
        const state = `${colorScheme}, ${expanded ? "expanded" : "collapsed"}`;
        // The window is marked a tick after the Tab, so the ring is polled rather than read once.
        await expect.configure({ soft: true }).poll(() => windowRing(window), { message: state }).toEqual(INSET_RING);
        expect.soft(await frameElement(page).evaluate((element) => getComputedStyle(element).outlineStyle), `${state}: the frame draws no ring of its own`).toBe("none");
      }
    }
  });
});
