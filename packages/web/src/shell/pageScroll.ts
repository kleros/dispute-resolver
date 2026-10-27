/**
 * What scrolls the page. `container`: the library's ScrollbarContainer around the app (PageScroller), on every desktop, so
 * a thin thumb floats over the page in the app's colours instead of a lane or the system's own thumb. `document`: the
 * browser's own scrolling, on phones and tablets, which keeps the address bar collapsing and pull-to-refresh.
 */
export type PageScroll = "document" | "container";

/** On the root while the page scroller scrolls the page; index.css stops the document scrolling under it. */
export const PAGE_SCROLL_ATTRIBUTE = "data-page-scroll";

/**
 * A mouse or a trackpad leads: a desktop or a laptop, whatever its scrollbars and however narrow its window. A phone or a
 * tablet leads with a finger.
 */
const DESKTOP_POINTER = "(hover: hover) and (pointer: fine)";

function pointsLikeADesktop(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_POINTER).matches;
}

/**
 * Classic scrollbars, which would keep a lane where a finger leads, as on a Windows tablet. The probe is styled through
 * the CSSOM, which the page's style policy allows, and never by the app's stylesheet, so it measures the browser's own
 * scrollbar.
 */
function scrollbarTakesWidth(ownerDocument: Document): boolean {
  const probe = ownerDocument.createElement("div");
  Object.assign(probe.style, { position: "absolute", top: "-9999px", width: "100px", height: "100px", overflow: "scroll", visibility: "hidden" });
  ownerDocument.body.append(probe);
  const scrollbarWidth = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return scrollbarWidth > 0;
}

/** Decided once, before the first render, so the app never remounts into the other scroller. */
export function choosePageScroll(root: HTMLElement): PageScroll {
  if (!pointsLikeADesktop() && !scrollbarTakesWidth(root.ownerDocument)) return "document";
  root.setAttribute(PAGE_SCROLL_ATTRIBUTE, "container");
  return "container";
}
