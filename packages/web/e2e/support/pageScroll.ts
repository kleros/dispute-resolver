import { expect, type BrowserContext, type Page } from "@playwright/test";

// On a desktop the app scrolls the page in its page scroller (shell/PageScroller.tsx): SimpleBar's content wrapper inside
// the library's ScrollbarContainer. On a phone or a tablet the document scrolls it. These helpers read whichever element
// scrolls the page, so a spec states what the visitor sees.

export const PAGE_SCROLLER = ".dr-page-scroller > .simplebar-wrapper > .simplebar-mask > .simplebar-offset > .simplebar-content-wrapper";

export interface PageScrollState {
  readonly top: number;
  readonly maxTop: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

export function pageScroll(page: Page): Promise<PageScrollState> {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector) ?? document.scrollingElement ?? document.documentElement;
    return {
      top: element.scrollTop,
      maxTop: element.scrollHeight - element.clientHeight,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
    };
  }, PAGE_SCROLLER);
}

export async function scrollPageTo(page: Page, top: number): Promise<void> {
  await page.evaluate(
    ([selector, offset]) => {
      const element = document.querySelector(selector) ?? document.scrollingElement ?? document.documentElement;
      element.scrollTo({ top: offset, behavior: "instant" });
    },
    [PAGE_SCROLLER, top] as const,
  );
}

export async function expectNoSidewaysScroll(page: Page, width: number): Promise<void> {
  const { scrollWidth, clientWidth } = await pageScroll(page);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(Math.max(scrollWidth - clientWidth, documentWidth - width), `the page scrolls sideways at ${String(width)} px`).toBeLessThanOrEqual(0);
}

/**
 * WebKit on Linux overlays its scrollbars and Playwright gives it no switch to classic ones, so its scroller project gives
 * every scrollbar a 15 px width before the app starts, as a page's own `::-webkit-scrollbar` rule makes WebKit lay out a
 * classic one: the page scroller then hides a scrollbar that takes layout space, as on a Mac set to always show them.
 */
export async function forceClassicWebKitScrollbars(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "::-webkit-scrollbar { width: 15px; height: 15px; }";
    // An init script can run before the document has its root element.
    const root = (): HTMLElement | null => document.documentElement;
    const attach = (): boolean => {
      const element = root();
      element?.append(style);
      return element !== null;
    };
    if (attach()) return;
    const observer = new MutationObserver(() => {
      if (attach()) observer.disconnect();
    });
    observer.observe(document, { childList: true });
  });
}
