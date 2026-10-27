import { devices, expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { openDisputesRpc } from "../support/arbitrator";
import { fakeAtlas } from "../support/atlas";
import { appOriginOf, fakeNetwork, loadRecording, type HttpRequest, type JsonAnswer } from "../support/network";
import { forceClassicWebKitScrollbars, PAGE_SCROLLER, pageScroll, scrollPageTo } from "../support/pageScroll";
import { printToPdf, settleForPrint, type PrintedPage } from "../support/print";
import { expectWalletConnected, injectWallet } from "../support/wallet";

// The page scroller on the built app, where the browser's scrollbar takes layout space: the projects give Chromium and
// Firefox classic scrollbars and WebKit a scrollbar rule that lays one out (playwright.config.ts), so the app's probe moves
// the page into the library's ScrollbarContainer. Every behaviour of a scrolling document the app relies on is checked
// against it; the last two groups check that a phone, and a desktop whose scrollbars overlay the page, keep the document
// scrolling with nothing reserved. The Ongoing list needs the build's chain-1 read RPC, and the evidence modal its Atlas
// URI, as a deploy has.

const WIDTH = 1280;
const HEIGHT = 800;
const HEAD = 24_000_000n;
const IDS = Array.from({ length: 30 }, (_, index) => 900n + BigInt(index));
const LAST_ID = 929n;
const MIDDLE_ID = 915n;
const ACCOUNT = "0x00000000000000000000000000000000000000e2";
const META_EVIDENCE_PATH = "/ipfs/QmTimingFixtureMetaEvidenceAForTestsXXXXXXXXXX/metaEvidence.json";
const CASE_RECORDING = loadRecording(new URL("fixtures/mainnet-1621-appeal.json", import.meta.url));

const TRACK = ".dr-page-scroller > .simplebar-track.simplebar-vertical";
const THUMB = `${TRACK} .simplebar-scrollbar`;
const HORIZONTAL_THUMB = ".dr-page-scroller > .simplebar-track.simplebar-horizontal .simplebar-scrollbar";
const MASK = ".dr-page-scroller > .simplebar-wrapper > .simplebar-mask";
const TRANSPARENT = "rgba(0, 0, 0, 0)";
/** Where the header's brand link leads on chain 1; no other link of the page leads there. */
const BRAND_PATH = "/1";

/** A stored Create draft that passes validation, so Continue moves to the summary. */
const CREATE_DRAFT = {
  version: 1,
  courtId: "0",
  votes: "3",
  category: "",
  title: "A dispute for the scroll check",
  description: "",
  questionType: "single-select",
  question: "Which option?",
  options: [
    { title: "First", description: "" },
    { title: "Second", description: "" },
  ],
  parties: [],
  primaryDocument: null,
};

test.use({ viewport: { width: WIDTH, height: HEIGHT } });

function card(page: Page, id: bigint): Locator {
  return page.getByRole("link").filter({ has: page.getByText(`#${id.toString()}`, { exact: true }) });
}

async function expectPageScroller(page: Page): Promise<void> {
  await expect(
    page.locator("html"),
    "the scrollbars of this browser overlay the page, so the app kept the document scrolling: run the spec in a project with classic scrollbars",
  ).toHaveAttribute("data-page-scroll", "container");
}

/** Every open dispute's meta-evidence names one file, so each card settles on its title at once. */
function metaEvidence(request: HttpRequest): JsonAnswer | undefined {
  if (request.kind === "locator") return { json: { metaEvidenceUri: META_EVIDENCE_PATH } };
  return request.path === META_EVIDENCE_PATH
    ? { json: { title: "A dispute in the long list", description: "Served by the page scroller spec.", question: "Which option?" } }
    : undefined;
}

/** The Ongoing list of thirty open disputes, long enough to scroll several pages, once every card has its final height. */
async function loadLongList(page: Page, baseURL: string | undefined): Promise<void> {
  await fakeNetwork(page.context(), { appOrigin: appOriginOf(baseURL), rpc: openDisputesRpc(IDS, HEAD), http: metaEvidence });
  await page.goto("/1/ongoing");
  await expect(card(page, LAST_ID), "the list never rendered (needs the chain-1 read RPC in the build)").toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main h2[aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
}

/** The long list, scrolled in the page scroller. */
async function openLongList(page: Page, baseURL: string | undefined): Promise<void> {
  await loadLongList(page, baseURL);
  await expectPageScroller(page);
}

async function scrollTop(page: Page): Promise<number> {
  return (await pageScroll(page)).top;
}

/** The computed colour a token resolves to in the current theme. */
async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, token);
}

async function thumbFill(page: Page): Promise<string> {
  return page.locator(THUMB).evaluate((thumb) => getComputedStyle(thumb, "::before").backgroundColor);
}

async function thumbBox(page: Page): Promise<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number }> {
  const box = await page.locator(THUMB).boundingBox();
  if (box === null) throw new Error("The thumb has no box.");
  return box;
}

async function bottomOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().bottom);
}

/**
 * Moves the pointer into the track and waits until SimpleBar, whose mouse handler is throttled to 64 ms, has seen it there:
 * it marks the track, and the thumb when the pointer is on it. A press acts on the last position SimpleBar saw.
 */
async function pointAt(page: Page, x: number, y: number, on: "thumb" | "track"): Promise<void> {
  const target = page.locator(on === "thumb" ? THUMB : TRACK);
  let nudge = 0;
  // A move SimpleBar's throttle dropped is not sent again, so a stalled wait moves the pointer by a pixel and back.
  await expect(async () => {
    await page.mouse.move(x, y + nudge, { steps: 2 });
    nudge = 1 - nudge;
    await expect(target).toHaveClass(/\bsimplebar-hover\b/, { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
}

/** The page's scroll offset once a smooth scroll has come to rest: unchanged over six frames. */
async function settledScrollTop(page: Page): Promise<number> {
  return page.evaluate(async (selector) => {
    const element = document.querySelector(selector) ?? document.scrollingElement ?? document.documentElement;
    let still = 0;
    let last = element.scrollTop;
    for (let frame = 0; frame < 240 && still < 6; frame += 1) {
      await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      still = element.scrollTop === last ? still + 1 : 0;
      last = element.scrollTop;
    }
    return last;
  }, PAGE_SCROLLER);
}

interface Span {
  readonly top: number;
  readonly bottom: number;
}

async function frameLayout(page: Page) {
  return page.evaluate((track) => {
    const span = (selector: string): Span => {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`The page has no ${selector}.`);
      const box = element.getBoundingClientRect();
      return { top: box.top + window.scrollY, bottom: box.bottom + window.scrollY };
    };
    const shown = (selector: string) => {
      const element = document.querySelector(selector);
      return element === null ? "none" : getComputedStyle(element).display;
    };
    return {
      header: span("header:not(main *)"),
      main: span("main"),
      footer: span("footer:not(main *)"),
      lastCard: span("main a[href$='/900']"),
      document: document.documentElement.scrollHeight,
      track: shown(track),
      notifications: shown("section[aria-label='Notifications']"),
    };
  }, TRACK);
}

function expectFrameInOrder(layout: { readonly header: Span; readonly main: Span; readonly footer: Span }): void {
  expect(Math.abs(layout.header.top), "the header is not at the top of the printed page").toBeLessThanOrEqual(1);
  expect(layout.header.bottom, "the header runs over the content").toBeLessThanOrEqual(layout.main.top);
  expect(layout.main.bottom, "the content runs over the footer").toBeLessThanOrEqual(layout.footer.top);
}

function printedLayout(pages: readonly PrintedPage[]): string[] {
  return pages.flatMap((printed, index) =>
    printed.links.map((link) => `page ${String(index + 1)}: ${link.href} at ${String(Math.round(link.left))}, ${String(Math.round(link.top))}-${String(Math.round(link.bottom))}`),
  );
}

function expectHeaderHeadsFirstPage(pages: readonly PrintedPage[]): void {
  const brands = pages.map((printed) => printed.links.filter((link) => link.href === BRAND_PATH).length);
  expect(brands, "the header's brand link is not printed once, on the first page").toEqual(pages.map((_, index) => (index === 0 ? 1 : 0)));
  const links = pages[0]?.links ?? [];
  const brand = links.find((link) => link.href === BRAND_PATH);
  if (brand === undefined) throw new Error("The first page has no brand link.");
  expect(brand.top, "a blank band heads the first page").toBeLessThanOrEqual(1);
  expect(
    links.filter((link) => link !== brand && link.top < brand.bottom).map((link) => link.href),
    "links printed over the header",
  ).toEqual([]);
}

async function expectPrintedAsFromTheTop(page: Page, offset: number): Promise<void> {
  await settleForPrint(page);
  await scrollPageTo(page, 0);
  const fromTop = await printToPdf(page);
  expectHeaderHeadsFirstPage(fromTop);
  await scrollPageTo(page, offset);
  expect(await scrollTop(page)).toBe(offset);
  const scrolled = await printToPdf(page);
  await expect.poll(() => scrollTop(page), { message: "printing moved the page" }).toBe(offset);
  expectHeaderHeadsFirstPage(scrolled);
  expect(printedLayout(scrolled), "the scrolled page prints otherwise than from the top").toEqual(printedLayout(fromTop));
}

/** Below the lg breakpoint the header's navigation is a drawer, with a scrim over the page. */
const NARROW = 800;

type HeaderMenu = readonly [name: string, find: (header: Locator) => readonly [button: Locator, panel: Locator]];

const HEADER_MENUS: readonly HeaderMenu[] = [
  ["the menu drawer", (header) => [header.getByRole("button", { name: "Menu", exact: true }), header.getByRole("navigation", { name: "Main" })]],
  ["the network menu", (header) => [header.getByRole("button", { name: /^Network: / }), header.getByRole("menu", { name: "Network" })]],
  ["the account menu", (header) => [header.getByRole("button", { name: /^Account 0x/ }), header.getByRole("dialog", { name: "Account" })]],
];

/** The long list where the header's navigation is a drawer, with a wallet connected so the account menu opens. */
async function openNarrowList(context: BrowserContext, page: Page, baseURL: string | undefined): Promise<Locator> {
  await injectWallet(context, { account: ACCOUNT, chainId: 1 });
  await page.setViewportSize({ width: NARROW, height: HEIGHT });
  await openLongList(page, baseURL);
  const header = page.getByRole("banner");
  await expectWalletConnected(header.getByRole("button", { name: /^Account 0x/ }));
  return header;
}

async function openHeaderMenu(header: Locator, [, find]: HeaderMenu): Promise<Locator> {
  const [button, panel] = find(header);
  await button.click();
  await expect(panel).toBeVisible();
  return panel;
}

/** Whatever lies over the main content where it starts, at three points across its width. */
async function overTheContent(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (main === null) throw new Error("The page has no main.");
    const box = main.getBoundingClientRect();
    // Just inside the content, where every header menu hangs over it.
    const y = Math.round(box.top + 24);
    return [0.1, 0.5, 0.9].flatMap((share) => {
      const x = Math.round(box.left + box.width * share);
      const hit = document.elementFromPoint(x, y);
      if (hit !== null && main.contains(hit)) return [];
      return [`${hit === null ? "nothing" : hit.outerHTML.slice(0, 120)} at ${String(x)}, ${String(y)}`];
    });
  });
}

/** Resolves once the page has drawn `count` more frames, by which time a wheel it received has started any scroll. */
async function frames(page: Page, count = 12): Promise<void> {
  await page.evaluate(async (remaining) => {
    for (let frame = 0; frame < remaining; frame += 1) {
      await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

test.describe("where the scrollbar takes layout space", () => {
  test.beforeEach(async ({ context, browserName }) => {
    if (browserName === "webkit") await forceClassicWebKitScrollbars(context);
  });

  test("on a long page only a 6 px thumb floats 2 px from the edge: no lane, the header and footer reach the right edge, and the document never scrolls", async ({
    page,
    baseURL,
  }) => {
    await openLongList(page, baseURL);
    const layout = await page.evaluate(
      ([scrollerSelector, trackSelector]) => {
        const scroller = document.querySelector(scrollerSelector);
        const track = document.querySelector(trackSelector);
        const thumb = track?.querySelector(".simplebar-scrollbar");
        const header = document.querySelector("header");
        const footer = document.querySelector("footer:not(main *)");
        if (!scroller || !track || !thumb || !header || !footer) throw new Error("The page scroller or the frame is missing.");
        const bar = getComputedStyle(thumb, "::before");
        const trackBox = track.getBoundingClientRect();
        return {
          viewport: window.innerWidth,
          documentWidth: document.documentElement.clientWidth,
          scrollerWidth: scroller.clientWidth,
          headerRight: header.getBoundingClientRect().right,
          footerRight: footer.getBoundingClientRect().right,
          trackRight: trackBox.right,
          trackWidth: trackBox.width,
          trackFill: getComputedStyle(track).backgroundColor,
          thumbShown: getComputedStyle(thumb).display !== "none" && getComputedStyle(track).visibility === "visible",
          thumbOpacity: bar.opacity,
          thumbWidth: Number.parseFloat(bar.width),
          thumbInset: Number.parseFloat(bar.right),
          thumbRadius: Number.parseFloat(bar.borderTopLeftRadius),
        };
      },
      [PAGE_SCROLLER, TRACK] as const,
    );
    expect(layout.documentWidth, "the document keeps a lane").toBe(layout.viewport);
    expect(layout.scrollerWidth, "the page scroller keeps a lane").toBe(layout.viewport);
    expect(layout.headerRight, "the header band stops short of the edge").toBe(layout.viewport);
    expect(layout.footerRight, "the footer band stops short of the edge").toBe(layout.viewport);
    expect(layout.trackRight).toBe(layout.viewport);
    expect(layout.trackWidth).toBe(10);
    expect(layout.trackFill, "the track is painted").toBe(TRANSPARENT);
    expect(layout.thumbShown, "the thumb hides").toBe(true);
    expect(layout.thumbOpacity).toBe("1");
    expect(layout.thumbWidth).toBe(6);
    expect(layout.thumbInset).toBe(2);
    expect(layout.thumbRadius).toBeGreaterThanOrEqual(3);

    await page.mouse.move(WIDTH / 2, HEIGHT / 2);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, root: document.documentElement.scrollTop }))).toEqual({ x: 0, y: 0, root: 0 });
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`in ${colorScheme} the thumb is --dr-scroll-thumb at rest, -hover under the pointer and -active while dragged, over the page's own background, ringed in the page colour where it crosses the header`, async ({
      page,
      baseURL,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openLongList(page, baseURL);
      const rest = await tokenColor(page, "--dr-scroll-thumb");
      const hover = await tokenColor(page, "--dr-scroll-thumb-hover");
      const active = await tokenColor(page, "--dr-scroll-thumb-active");
      const pageColor = await tokenColor(page, "--klerosUIComponentsLightBackground");
      expect(new Set([rest, hover, active]).size).toBe(3);
      expect(await thumbFill(page)).toBe(rest);
      expect(await page.locator(MASK).evaluate((mask) => getComputedStyle(mask).backgroundColor), "the mask hides the page colour").toBe(TRANSPARENT);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(pageColor);
      const cardFill = await card(page, LAST_ID)
        .locator(".bg-klerosUIComponentsWhiteBackground")
        .first()
        .evaluate((surface) => getComputedStyle(surface).backgroundColor);
      expect(cardFill, "a library card inside the page lost its WhiteBackground to the mask").toBe(await tokenColor(page, "--klerosUIComponentsWhiteBackground"));
      expect((await thumbBox(page)).y, "at the top of the page the thumb starts over the header").toBeLessThan(await bottomOf(page.getByRole("banner")));
      const ring = await page.locator(THUMB).evaluate((thumb) => getComputedStyle(thumb, "::before").boxShadow);
      expect(ring, "no ring of the page colour sets the thumb off the header and footer").toContain(pageColor);
      expect(ring).toContain("1px");

      const box = await thumbBox(page);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await pointAt(page, x, y, "thumb");
      await expect.poll(() => thumbFill(page)).toBe(hover);
      await page.mouse.down();
      await expect.poll(() => thumbFill(page)).toBe(active);
      await page.mouse.move(x, y + 40, { steps: 4 });
      await expect.poll(() => thumbFill(page)).toBe(active);
      await page.mouse.up();
      await page.mouse.move(WIDTH / 2, HEIGHT / 2, { steps: 4 });
      await expect.poll(() => thumbFill(page)).toBe(rest);
    });
  }

  test("on a short page the footer sits at the bottom of the viewport and no thumb shows", async ({ page, baseURL }) => {
    await fakeNetwork(page.context(), { appOrigin: appOriginOf(baseURL) });
    await page.goto("/100/nowhere");
    await expect(page.getByText("404", { exact: true })).toBeVisible();
    await expectPageScroller(page);
    expect(await bottomOf(page.getByRole("contentinfo"))).toBeCloseTo(HEIGHT, 0);
    expect((await pageScroll(page)).maxTop).toBe(0);
    await expect.poll(() => page.locator(THUMB).evaluate((thumb) => getComputedStyle(thumb).display)).toBe("none");
  });

  for (const key of ["Space", "PageDown", "End", "ArrowDown"] as const) {
    test(`${key} scrolls the page right after load, with nothing focused`, async ({ page, baseURL }) => {
      await openLongList(page, baseURL);
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      await page.keyboard.press(key);
      await expect.poll(() => scrollTop(page)).toBeGreaterThan(key === "ArrowDown" ? 20 : 300);
      if (key === "End") {
        await expect.poll(async () => (await pageScroll(page)).maxTop - (await scrollTop(page))).toBeLessThanOrEqual(1);
      }
    });
  }

  test("once the keys scroll the page, the arrows, Page Up and Shift+Space scroll it back and Home returns to the top", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    await page.keyboard.press("PageDown");
    await page.keyboard.press("PageDown");
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(900);
    for (const key of ["ArrowUp", "PageUp", "Shift+Space"]) {
      const before = await settledScrollTop(page);
      await page.keyboard.press(key);
      await expect.poll(() => scrollTop(page), key).toBeLessThan(before);
    }
    await page.keyboard.press("Home");
    await expect.poll(() => scrollTop(page)).toBe(0);
  });

  test("after a click on the page's content the keys still scroll it, and Tab moves on from where the click landed", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    await page.getByRole("heading", { level: 1, name: "Ongoing Disputes" }).click();
    await page.keyboard.press("PageDown");
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(300);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("main") !== null), "Tab went back to the header").toBe(true);
  });

  test("the first Tab reaches the header's brand link, the first Shift+Tab the footer, and the page keeps its landmarks", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("banner").getByRole("link", { name: "Kleros Dispute Resolver" })).toBeFocused();
    await page.reload();
    await expect(card(page, LAST_ID)).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("footer") !== null), "Shift+Tab did not reach the footer").toBe(true);

    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.getByRole("region", { name: "scrollable content" })).toHaveCount(0);
    const scroller = await page.locator(PAGE_SCROLLER).evaluate((element) => ({
      tabindex: element.getAttribute("tabindex"),
      role: element.getAttribute("role"),
      label: element.getAttribute("aria-label"),
    }));
    expect(scroller, "the page scroller is a tab stop or a landmark").toEqual({ tabindex: "-1", role: null, label: null });
  });

  test("on a case page opened by its address, the first Tab reaches the header's brand link too", async ({ page, baseURL }) => {
    await fakeNetwork(page.context(), { appOrigin: appOriginOf(baseURL), recordings: [CASE_RECORDING] });
    await page.goto("/1/cases/1621");
    await expect(page.getByRole("button", { name: "Evidence", exact: true })).toBeVisible({ timeout: 30_000 });
    await expectPageScroller(page);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("banner").getByRole("link", { name: "Kleros Dispute Resolver" })).toBeFocused();
  });

  test("after the keys scroll the page, Tab and Shift+Tab move on as they do when nothing has focus", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    await page.keyboard.press("PageDown");
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(300);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("banner").getByRole("link", { name: "Kleros Dispute Resolver" })).toBeFocused();

    await page.reload();
    await expect(card(page, LAST_ID)).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press("PageDown");
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(300);
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("footer") !== null), "Shift+Tab did not reach the footer").toBe(true);
  });

  // Firefox scrolls to a focused element only while none of it shows, as it does in a scrolling document; Chromium and
  // WebKit bring all of it into view.
  test("Tab into content below the fold scrolls it into view, clear of the sticky header", async ({ page, baseURL, browserName }) => {
    await openLongList(page, baseURL);
    const headerBottom = await bottomOf(page.getByRole("banner"));
    let scrolled = false;
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press("Tab");
      // WebKit scrolls the focused element into view in a later task than the key's, which can run after the press resolves.
      const offset = await settledScrollTop(page);
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        if (element === null || element === document.body || element.closest("header") !== null) return null;
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, label: element.textContent.slice(0, 40) };
      });
      if (focused === null) continue;
      expect(focused.top, `${focused.label} sits under the header`).toBeGreaterThanOrEqual(headerBottom - 1);
      expect(focused.top, `${focused.label} sits below the fold`).toBeLessThan(HEIGHT);
      if (browserName !== "firefox") expect(focused.bottom, `${focused.label} runs below the fold`).toBeLessThanOrEqual(HEIGHT + 1);
      if (offset > 0) scrolled = true;
    }
    expect(scrolled, "no Tab moved into content below the fold").toBe(true);
  });

  test("scrolling deep content into view, as find in page does, brings it just below the sticky header", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    const headerBottom = await bottomOf(page.getByRole("banner"));
    await card(page, MIDDLE_ID).evaluate((element) => {
      element.scrollIntoView();
    });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
    const top = await card(page, MIDDLE_ID).evaluate((element) => element.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(headerBottom);
    expect(top).toBeLessThanOrEqual(headerBottom + 16);
  });

  test("the wheel, a drag of the thumb and a press on the track scroll the page, and the press opens nothing beneath it", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    await page.mouse.move(WIDTH / 2, HEIGHT / 2);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => scrollTop(page)).toBeGreaterThanOrEqual(400);

    await scrollPageTo(page, 0);
    await expect.poll(async () => (await thumbBox(page)).y).toBeLessThan(4);
    const { maxTop, clientHeight } = await pageScroll(page);
    const box = await thumbBox(page);
    await pointAt(page, box.x + box.width / 2, box.y + box.height / 2, "thumb");
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 100, { steps: 5 });
    await page.mouse.up();
    const dragged = (100 * maxTop) / (HEIGHT - box.height);
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(dragged * 0.9);
    expect(await scrollTop(page)).toBeLessThan(dragged * 1.1);

    await scrollPageTo(page, 0);
    await expect.poll(async () => (await thumbBox(page)).y).toBeLessThan(4);
    await pointAt(page, WIDTH - 5, HEIGHT - 60, "track");
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(clientHeight - 60);
    expect(await scrollTop(page)).toBeLessThan(clientHeight + 60);
    await expect(page).toHaveURL(/\/1\/ongoing$/);
  });

  test("a library dropdown opens at its trigger while the page is scrolled, and the page holds still under it", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    const trigger = page.locator("button[aria-haspopup='listbox']").first();
    await page.mouse.move(WIDTH / 2, HEIGHT / 2);
    await page.mouse.wheel(0, 60);
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
    await expect(trigger).toBeInViewport();
    const before = await settledScrollTop(page);
    await trigger.click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    const ownScrollbar = await listbox.evaluate((list) => {
      const root = list.closest("[data-simplebar]");
      const mask = root?.querySelector(":scope > .simplebar-wrapper > .simplebar-mask");
      const thumb = root?.querySelector(":scope > .simplebar-track.simplebar-vertical > .simplebar-scrollbar");
      if (!mask || !thumb) throw new Error("The dropdown has no scrollbar of its own.");
      return { mask: getComputedStyle(mask).backgroundColor, thumb: getComputedStyle(thumb, "::before").backgroundColor };
    });
    expect(ownScrollbar, "the dropdown's own scrollbar took the page scroller's colours").toEqual({
      mask: await tokenColor(page, "--klerosUIComponentsWhiteBackground"),
      thumb: await tokenColor(page, "--klerosUIComponentsPrimaryBlue"),
    });
    const [triggerBox, listBox] = await Promise.all([trigger.boundingBox(), listbox.boundingBox()]);
    if (triggerBox === null || listBox === null) throw new Error("The dropdown or its trigger has no box.");
    expect(Math.abs(listBox.y - (triggerBox.y + triggerBox.height)), "the list opens away from its trigger").toBeLessThanOrEqual(16);
    await page.mouse.move(WIDTH / 2, HEIGHT - 40);
    await page.mouse.wheel(0, 400);
    await frames(page);
    expect(await scrollTop(page), "the page scrolled under the open dropdown").toBe(before);
    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
    expect(await scrollTop(page)).toBe(before);
  });

  // Each menu focuses an element in the sticky bar, which scrolls a scrolled page as it did when the document scrolled
  // (the bar sits in the scroll-padding-top band), so only where the menus open is checked.
  test("the network switcher and the account menu open under their buttons while the page is scrolled", async ({ context, page, baseURL }) => {
    await injectWallet(context, { account: ACCOUNT, chainId: 1 });
    await openLongList(page, baseURL);
    const header = page.getByRole("banner");
    const account = header.getByRole("button", { name: /^Account 0x/ });
    await expectWalletConnected(account);
    await scrollPageTo(page, 1200);
    for (const [button, panel] of [
      [header.getByRole("button", { name: /^Network: / }), header.getByRole("menu", { name: "Network" })],
      [account, header.getByRole("dialog", { name: "Account" })],
    ] as const) {
      await button.click();
      await expect(panel).toBeVisible();
      const [buttonBox, panelBox] = await Promise.all([button.boundingBox(), panel.boundingBox()]);
      if (buttonBox === null || panelBox === null) throw new Error("A header menu or its button has no box.");
      expect(panelBox.y, "the menu opens above its button").toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height - 1);
      expect(panelBox.y + panelBox.height, "the menu runs off the viewport").toBeLessThanOrEqual(HEIGHT);
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
    }
  });

  // The press on Connect focuses it in the sticky bar, which scrolls a scrolled page as it did when the document scrolled.
  test("the wallet modal opens over the scrolled page and the page holds still under it", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    await scrollPageTo(page, 1200);
    await page.getByRole("banner").getByRole("button", { name: "Connect", exact: true }).click();
    const modal = page.locator("w3m-modal");
    await expect(modal.getByText("Connect Wallet")).toBeVisible({ timeout: 15_000 });
    const opened = await settledScrollTop(page);
    expect(opened).toBeGreaterThan(0);
    await page.mouse.move(40, HEIGHT / 2);
    await page.mouse.wheel(0, 400);
    await frames(page);
    expect(await scrollTop(page), "the page scrolled under the wallet modal").toBe(opened);
    await page.keyboard.press("Escape");
    await expect(modal.getByText("Connect Wallet")).toBeHidden();
    expect(await settledScrollTop(page)).toBe(opened);
  });

  // AppKit leaves the focus on Connect when its modal opens, and locks only the body, as it would a scrolling document.
  test("the scroll keys pressed before the wallet modal is touched leave the page where it is, and scroll it again once the modal closes", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    await scrollPageTo(page, 1200);
    await page.getByRole("banner").getByRole("button", { name: "Connect", exact: true }).click();
    const modal = page.locator("w3m-modal");
    await expect(modal.getByText("Connect Wallet")).toBeVisible({ timeout: 15_000 });
    const opened = await settledScrollTop(page);
    expect(opened).toBeGreaterThan(0);
    for (const key of ["PageDown", "ArrowDown", "End"]) {
      await page.keyboard.press(key);
      await frames(page);
      expect(await scrollTop(page), `${key} scrolled the page under the wallet modal`).toBe(opened);
    }
    await page.keyboard.press("Escape");
    await expect(modal.getByText("Connect Wallet")).toBeHidden();
    await page.keyboard.press("PageDown");
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(opened);
  });

  test("the library's modal opens over the scrolled case page and the page holds still under it", async ({ context, page, baseURL }) => {
    await injectWallet(context, { account: ACCOUNT, chainId: 1 });
    await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), recordings: [CASE_RECORDING], atlas: fakeAtlas().answer });
    await page.goto("/1/cases/1621");
    await expectPageScroller(page);
    await expectWalletConnected(page.getByRole("banner").getByRole("button", { name: /^Account 0x/ }));
    const evidence = page.getByRole("button", { name: "Evidence", exact: true });
    await expect(evidence).toBeVisible({ timeout: 30_000 });
    // The case's sections reflow as they load, and a press that lands while they move can miss the button.
    await expect(page.locator("main [aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
    await evidence.click();
    await expect(evidence).toHaveAttribute("aria-expanded", "true");
    const submit = page.getByRole("button", { name: "Submit New Evidence" });
    await expect(submit, "evidence cannot be submitted (the build needs REACT_APP_ATLAS_URI)").toBeEnabled({ timeout: 30_000 });
    await submit.scrollIntoViewIfNeeded();
    const before = await settledScrollTop(page);
    expect(before, "the case page is too short to scroll").toBeGreaterThan(0);
    await submit.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    if (box === null) throw new Error("The modal has no box.");
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(HEIGHT);
    await page.mouse.move(20, HEIGHT / 2);
    await page.mouse.wheel(0, 400);
    await frames(page);
    expect(await scrollTop(page), "the page scrolled under the modal").toBe(before);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await scrollTop(page)).toBe(before);
  });

  test("the Create page brings its steps into view below the header when Continue changes the step", async ({ page, baseURL }) => {
    await page.addInitScript((draft) => {
      window.localStorage.setItem("dr-create-draft:1", draft);
    }, JSON.stringify(CREATE_DRAFT));
    await fakeNetwork(page.context(), { appOrigin: appOriginOf(baseURL) });
    await page.setViewportSize({ width: WIDTH, height: 600 });
    await page.goto("/1/create");
    await expectPageScroller(page);
    const proceed = page.getByRole("button", { name: "Continue" });
    await proceed.scrollIntoViewIfNeeded();
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
    await proceed.click();
    await expect(page.locator("[data-create-step='summary']")).toBeVisible();
    const steps = page.getByRole("navigation", { name: "Create dispute steps" });
    const headerBottom = await bottomOf(page.getByRole("banner"));
    await expect.poll(() => steps.evaluate((nav) => nav.getBoundingClientRect().top)).toBeGreaterThanOrEqual(headerBottom - 1);
    expect(await bottomOf(steps)).toBeLessThanOrEqual(600);
  });

  test("Back returns the list to where it was scrolled, and a case opened from it starts at its top, as when the document scrolled", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    await scrollPageTo(page, 1500);
    const target = card(page, MIDDLE_ID);
    await target.scrollIntoViewIfNeeded();
    const before = await settledScrollTop(page);
    await target.click();
    await expect(page).toHaveURL(/\/1\/cases\/915$/);
    await expect.poll(() => scrollTop(page)).toBe(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/1\/ongoing$/);
    await expect.poll(async () => Math.abs((await scrollTop(page)) - before)).toBeLessThanOrEqual(2);
  });

  test("a window resize keeps the thumb in step with the page, with no sideways scroll", async ({ page, baseURL }) => {
    await openLongList(page, baseURL);
    await scrollPageTo(page, 1000);
    await page.setViewportSize({ width: 900, height: 600 });
    await expect
      .poll(async () => {
        const [state, box, track] = await Promise.all([pageScroll(page), thumbBox(page), page.locator(TRACK).boundingBox()]);
        if (track === null) return "no track";
        const size = Math.max(Math.floor((track.height * state.clientHeight) / (state.maxTop + state.clientHeight)), 25);
        const offset = Math.floor(((track.height - size) * state.top) / state.maxTop);
        return Math.abs(box.height - size) <= 2 && Math.abs(box.y - track.y - offset) <= 2
          ? "in step"
          : `thumb ${String(box.height)} at ${String(box.y - track.y)}, page wants ${String(size)} at ${String(offset)}`;
      })
      .toBe("in step");
    const { scrollWidth, clientWidth } = await pageScroll(page);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("the theme switch recolours the thumb at once", async ({ page, baseURL }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openLongList(page, baseURL);
    const light = await thumbFill(page);
    await page.getByRole("banner").getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    expect(await thumbFill(page)).toBe(await tokenColor(page, "--dr-scroll-thumb"));
    expect(await thumbFill(page)).not.toBe(light);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`in ${colorScheme}, while a theme flip applies, nothing but the toggle's icons has a transition, a library dropdown on the scrolled page included`, async ({
      page,
      baseURL,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openLongList(page, baseURL);
      await page.mouse.move(WIDTH / 2, HEIGHT / 2);
      await page.mouse.wheel(0, 60);
      await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
      await page.locator("button[aria-haspopup='listbox']").first().click();
      await expect(page.getByRole("listbox")).toBeVisible();
      const transitions = await page.evaluate((attribute) => {
        const root = document.documentElement;
        root.setAttribute(attribute, "");
        const moving: string[] = [];
        const icons: string[] = [];
        for (const element of root.querySelectorAll("*")) {
          const own = getComputedStyle(element).transitionProperty;
          if (element.matches("[data-icon-swap] > *")) icons.push(own);
          else if (own !== "none") moving.push(`${element.tagName} ${own}`);
          for (const pseudo of ["::before", "::after"]) {
            const pseudoOwn = getComputedStyle(element, pseudo).transitionProperty;
            if (pseudoOwn !== "none") moving.push(`${element.tagName}${pseudo} ${pseudoOwn}`);
          }
        }
        root.removeAttribute(attribute);
        return { moving, icons };
      }, "data-theme-switching");
      expect(transitions.moving, "a transition runs during the flip").toEqual([]);
      expect(transitions.icons.length).toBeGreaterThan(0);
      expect(
        transitions.icons.filter((property) => property === "none"),
        "the toggle's icon swap is paused too",
      ).toEqual([]);
    });
  }

  test("printed while scrolled, the page flows past the viewport as the document did from its top: header, content and footer in order, no scrollbar and no notifications, and the screen keeps its offset", async ({
    page,
    baseURL,
  }) => {
    await openLongList(page, baseURL);
    await scrollPageTo(page, 1200);
    expect(await scrollTop(page)).toBe(1200);
    await page.emulateMedia({ media: "print" });
    const printed = await frameLayout(page);
    expectFrameInOrder(printed);
    expect(printed.lastCard.bottom, "the last card is cut off").toBeGreaterThan(HEIGHT);
    expect(printed.footer.bottom, "the footer is cut off").toBeGreaterThan(printed.lastCard.bottom);
    expect(printed.document, "the document ends at the viewport").toBeGreaterThanOrEqual(printed.footer.bottom - 1);
    expect(printed.track).toBe("none");
    expect(printed.notifications, "a toast would print over the page").toBe("none");
    await page.emulateMedia({ media: null });
    await expect.poll(() => scrollTop(page)).toBe(1200);
  });

  test("printed while the wallet modal is open, the page stays where it was scrolled", async ({ page, baseURL, browserName }) => {
    await openLongList(page, baseURL);
    await scrollPageTo(page, 1200);
    await page.getByRole("banner").getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.locator("w3m-modal").getByText("Connect Wallet")).toBeVisible({ timeout: 15_000 });
    const opened = await settledScrollTop(page);
    expect(opened).toBeGreaterThan(0);
    // Only Chromium prints to PDF; Firefox and WebKit lay the page out for print under emulation.
    if (browserName === "chromium") {
      await page.pdf();
    } else {
      await page.emulateMedia({ media: "print" });
      await pageScroll(page);
      await page.emulateMedia({ media: null });
    }
    await expect.poll(() => scrollTop(page)).toBe(opened);
  });

  for (const menu of HEADER_MENUS) {
    test(`printed with ${menu[0]} open, nothing prints over the page, and the menu stays open on screen`, async ({ context, page, baseURL }) => {
      const panel = await openHeaderMenu(await openNarrowList(context, page, baseURL), menu);
      await page.emulateMedia({ media: "print" });
      expect(await overTheContent(page), `${menu[0]} prints over the page`).toEqual([]);
      await page.emulateMedia({ media: null });
      await expect(panel).toBeVisible();
      expect(await overTheContent(page), `${menu[0]} no longer hangs over the page on screen`).not.toEqual([]);
    });
  }

  test.describe("printed to PDF", () => {
    // Only Chromium prints to PDF; the print emulation tests cover Firefox and WebKit.
    test.skip(({ browserName }) => browserName !== "chromium", "Only Chromium prints to PDF.");

    test("the long list runs over several pages", async ({ page, baseURL }) => {
      await openLongList(page, baseURL);
      expect((await printToPdf(page)).length).toBeGreaterThan(1);
    });

    test("scrolled down the long list, it prints as from the top: the header heads the first page and the cards follow it", async ({ page, baseURL }) => {
      await openLongList(page, baseURL);
      await expectPrintedAsFromTheTop(page, 1200);
    });

    test("from the middle of a case page with its evidence open, in the dark theme, it prints as from the top", async ({ page, baseURL }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await fakeNetwork(page.context(), { appOrigin: appOriginOf(baseURL), recordings: [CASE_RECORDING] });
      await page.goto("/1/cases/1621");
      await expectPageScroller(page);
      const evidence = page.getByRole("button", { name: "Evidence", exact: true });
      await expect(evidence).toBeVisible({ timeout: 30_000 });
      // A press while the case's sections still reflow can miss the button.
      await settleForPrint(page);
      await evidence.click();
      await expect(evidence).toHaveAttribute("aria-expanded", "true");
      await settleForPrint(page);
      const { maxTop } = await pageScroll(page);
      expect(maxTop, "the case page is too short to scroll").toBeGreaterThan(0);
      await expectPrintedAsFromTheTop(page, Math.round(maxTop / 2));
    });

    test("from the middle of the Create page, it prints as from the top", async ({ page, baseURL }) => {
      await fakeNetwork(page.context(), { appOrigin: appOriginOf(baseURL) });
      await page.goto("/1/create");
      await expectPageScroller(page);
      // No chain read is answered, so the page has its final height once the cost read has failed.
      await expect(page.getByRole("status", { name: "Arbitration Cost" })).toContainText("Could not read the arbitration cost", { timeout: 30_000 });
      await settleForPrint(page);
      const { maxTop } = await pageScroll(page);
      expect(maxTop, "the Create page is too short to scroll").toBeGreaterThan(0);
      await expectPrintedAsFromTheTop(page, Math.round(maxTop / 2));
    });

    for (const menu of HEADER_MENUS) {
      test(`with ${menu[0]} open, it prints as with every menu closed`, async ({ context, page, baseURL }) => {
        const header = await openNarrowList(context, page, baseURL);
        await settleForPrint(page);
        const closed = printedLayout(await printToPdf(page));
        const panel = await openHeaderMenu(header, menu);
        await settleForPrint(page);
        expect(printedLayout(await printToPdf(page)), `${menu[0]} prints over the page`).toEqual(closed);
        await expect(panel).toBeVisible();
      });
    }
  });

  for (const width of [375, 768, 1280]) {
    test(`at ${String(width)} px the page does not scroll sideways and no horizontal thumb shows`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await openLongList(page, baseURL);
      const { scrollWidth, clientWidth } = await pageScroll(page);
      expect(clientWidth).toBe(width);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      expect(await page.locator(HORIZONTAL_THUMB).evaluate((thumb) => getComputedStyle(thumb).display)).toBe("none");
    });
  }
});

test.describe("where scrollbars overlay the page, as on a phone", () => {
  const phone = devices["Pixel 7"];
  test.use({ viewport: phone.viewport, userAgent: phone.userAgent, deviceScaleFactor: phone.deviceScaleFactor, isMobile: true, hasTouch: true });
  // Firefox emulates no phone; WebKit's overlay scrollbars are checked on a desktop below.
  test.skip(({ browserName }) => browserName !== "chromium", "Only Chromium emulates a phone's overlay scrollbars here.");

  test("the document keeps scrolling the page and no page scroller is mounted", async ({ page, baseURL }) => {
    await fakeNetwork(page.context(), { appOrigin: appOriginOf(baseURL), rpc: openDisputesRpc(IDS, HEAD), http: metaEvidence });
    await page.goto("/1/ongoing");
    await expect(card(page, LAST_ID)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("html")).not.toHaveAttribute("data-page-scroll");
    await expect(page.locator(".dr-page-scroller")).toHaveCount(0);
    const root = await page.evaluate(() => ({
      overflow: getComputedStyle(document.documentElement).overflowY,
      gutter: getComputedStyle(document.documentElement).scrollbarGutter,
    }));
    expect(root).toEqual({ overflow: "visible", gutter: "auto" });
    await page.evaluate(() => {
      window.scrollTo({ top: 600, behavior: "instant" });
    });
    expect(await page.evaluate(() => window.scrollY)).toBe(600);
  });

  test("printed while scrolled, the header heads the page and the content and footer follow it, as from the top, and the screen keeps its offset", async ({ page, baseURL }) => {
    await loadLongList(page, baseURL);
    await scrollPageTo(page, 1200);
    expect(await scrollTop(page)).toBe(1200);
    await page.emulateMedia({ media: "print" });
    expectFrameInOrder(await frameLayout(page));
    await page.emulateMedia({ media: null });
    await expect.poll(() => scrollTop(page)).toBe(1200);
  });

  test("printed to PDF while scrolled, the list prints as from the top: the header heads the first page and the cards follow it", async ({ page, baseURL }) => {
    await loadLongList(page, baseURL);
    await expect(page.locator("html")).not.toHaveAttribute("data-page-scroll");
    await expectPrintedAsFromTheTop(page, 1200);
  });
});

test.describe("where scrollbars overlay the page on a desktop, as on a Mac by default", () => {
  // WebKit on Linux overlays its scrollbars as macOS does; the other projects lay classic ones out.
  test.skip(({ browserName }) => browserName !== "webkit", "Only WebKit overlays a desktop's scrollbars here.");

  test("the document scrolls a long page under the browser's own floating scrollbar: no page scroller, no lane and nothing reserved", async ({ page, baseURL }) => {
    await fakeNetwork(page.context(), { appOrigin: appOriginOf(baseURL), rpc: openDisputesRpc(IDS, HEAD), http: metaEvidence });
    await page.goto("/1/ongoing");
    await expect(card(page, LAST_ID)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("html")).not.toHaveAttribute("data-page-scroll");
    await expect(page.locator(".dr-page-scroller")).toHaveCount(0);
    const root = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.clientWidth,
      headerRight: document.querySelector("header")?.getBoundingClientRect().right,
      gutter: getComputedStyle(document.documentElement).scrollbarGutter,
    }));
    expect(root).toEqual({ viewport: WIDTH, documentWidth: WIDTH, headerRight: WIDTH, gutter: "auto" });
    await page.evaluate(() => {
      window.scrollTo({ top: 600, behavior: "instant" });
    });
    expect(await page.evaluate(() => window.scrollY)).toBe(600);
  });
});
