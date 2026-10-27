/**
 * What scrolls the page. `document`: the browser's own scrolling, where scrollbars overlay the page (phones, tablets,
 * macOS by default), which keeps a phone's address bar collapsing and pull-to-refresh. `container`: the library's
 * ScrollbarContainer around the app (PageScroller), where the browser's scrollbar takes layout space (classic scrollbars:
 * Windows and Linux desktops, macOS set to always show them), so a thin thumb floats over the page instead of a lane.
 */
export type PageScroll = "document" | "container";

/** On the root while the page scroller scrolls the page; index.css stops the document scrolling under it. */
export const PAGE_SCROLL_ATTRIBUTE = "data-page-scroll";

/**
 * Decided once, before the first render: a scrolling probe whose scrollbar takes width means classic scrollbars. The
 * probe is styled through the CSSOM, which the page's style policy allows, and never by the app's stylesheet, so it
 * measures the browser's own scrollbar.
 */
export function choosePageScroll(root: HTMLElement): PageScroll {
  const { body } = root.ownerDocument;
  const probe = root.ownerDocument.createElement("div");
  Object.assign(probe.style, { position: "absolute", top: "-9999px", width: "100px", height: "100px", overflow: "scroll", visibility: "hidden" });
  body.append(probe);
  const scrollbarWidth = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  if (scrollbarWidth <= 0) return "document";
  root.setAttribute(PAGE_SCROLL_ATTRIBUTE, "container");
  return "container";
}
