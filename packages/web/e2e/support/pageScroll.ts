import type { BrowserContext, Page } from "@playwright/test";

// On a desktop the app scrolls the page in its page scroller (shell/PageScroller.tsx): SimpleBar's content wrapper inside
// the library's ScrollbarContainer. On a phone or a tablet the document scrolls it. These helpers read whichever element
// scrolls the page, so a spec states what the visitor sees.

/** The page scroller's scrolling element. */
export const PAGE_SCROLLER = ".dr-page-scroller > .simplebar-wrapper > .simplebar-mask > .simplebar-offset > .simplebar-content-wrapper";

export interface PageScrollState {
  readonly top: number;
  /** The largest `top` the page reaches. */
  readonly maxTop: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

/** The page's scroll offset and extent, from the page scroller when the app mounted one, else from the document. */
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

/** Sets the page's scroll offset at once, on whichever element scrolls it. */
export async function scrollPageTo(page: Page, top: number): Promise<void> {
  await page.evaluate(
    ([selector, offset]) => {
      const element = document.querySelector(selector) ?? document.scrollingElement ?? document.documentElement;
      element.scrollTo({ top: offset, behavior: "instant" });
    },
    [PAGE_SCROLLER, top] as const,
  );
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
    const attach = (element: HTMLElement) => {
      element.append(style);
    };
    const present = root();
    if (present !== null) {
      attach(present);
      return;
    }
    const observer = new MutationObserver(() => {
      const element = root();
      if (element === null) return;
      observer.disconnect();
      attach(element);
    });
    observer.observe(document, { childList: true });
  });
}
