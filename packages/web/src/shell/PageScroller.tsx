import { ScrollbarContainer } from "@kleros/ui-components-library";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router";
import type { PageScroll } from "./pageScroll";

const PAGE_SCROLLER_CLASS = "dr-page-scroller";

const SCROLL_KEYS = new Set([" ", "PageDown", "PageUp", "End", "Home", "ArrowDown", "ArrowUp"]);

const ScrollerContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

/**
 * The document no longer scrolls, so right after load, or once the pressed element has left the page, the scroll keys
 * would scroll nothing: the scroller then takes the focus for the key. Its focus stop stays out of the tab order, or
 * Firefox makes it a tab stop, and is lifted while a press lasts, or the press lands on the scroller and Chromium Tabs
 * from the top. Tab and Shift+Tab from the scroller leave from a passing stop at the page's start or end, because from the
 * scroller itself Shift+Tab finds nothing before it. SimpleBar's tab stop and "scrollable content" region go: the page
 * never had them.
 */
function routeKeysToScroller(scroller: HTMLElement): () => void {
  const { ownerDocument } = scroller;
  const view = ownerDocument.defaultView;
  scroller.setAttribute("tabindex", "-1");
  scroller.removeAttribute("role");
  scroller.removeAttribute("aria-label");
  let lastPress: EventTarget | null = null;
  let pressing = false;

  const pressedInPage = () => lastPress instanceof Node && lastPress.isConnected && scroller.contains(lastPress);
  const endPress = () => {
    if (!pressing) return;
    pressing = false;
    scroller.setAttribute("tabindex", "-1");
  };
  const onPointerDown = (event: PointerEvent) => {
    lastPress = event.target;
    pressing = true;
    scroller.removeAttribute("tabindex");
  };
  const leaveBy = (forward: boolean) => {
    const stop = ownerDocument.createElement("span");
    stop.tabIndex = -1;
    stop.addEventListener(
      "blur",
      () => {
        stop.remove();
      },
      { once: true },
    );
    if (forward) scroller.prepend(stop);
    else scroller.append(stop);
    stop.focus({ preventScroll: true });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    endPress();
    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "Tab") {
      if (ownerDocument.activeElement === scroller) leaveBy(!event.shiftKey);
      return;
    }
    if (!SCROLL_KEYS.has(event.key) || (event.target !== ownerDocument.body && event.target !== ownerDocument.documentElement) || pressedInPage()) return;
    scroller.focus({ preventScroll: true });
  };

  ownerDocument.addEventListener("pointerdown", onPointerDown, true);
  ownerDocument.addEventListener("pointerup", endPress, true);
  ownerDocument.addEventListener("pointercancel", endPress, true);
  view?.addEventListener("keydown", onKeyDown);
  return () => {
    ownerDocument.removeEventListener("pointerdown", onPointerDown, true);
    ownerDocument.removeEventListener("pointerup", endPress, true);
    ownerDocument.removeEventListener("pointercancel", endPress, true);
    view?.removeEventListener("keydown", onKeyDown);
  };
}

/**
 * A print lays the page out at the paper's width, where content that follows a width query in script (the case timeline)
 * renders for the paper, then back once the print ends. The browser anchors the scroll to the change back only, so the
 * page would come back away from where it was: the offset from before the print is put back on the first frame after it.
 */
function keepOffsetThroughPrint(scrolling: Element): () => void {
  const view = scrolling.ownerDocument.defaultView;
  if (view === null) return () => undefined;
  let offset: number | null = null;
  let frame: number | null = null;
  const remember = () => {
    offset ??= scrolling.scrollTop;
  };
  const restore = () => {
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(() => {
      frame = null;
      if (offset !== null) scrolling.scrollTo({ top: offset, behavior: "instant" });
      offset = null;
    });
  };
  view.addEventListener("beforeprint", remember);
  view.addEventListener("afterprint", restore);
  return () => {
    view.removeEventListener("beforeprint", remember);
    view.removeEventListener("afterprint", restore);
    if (frame !== null) view.cancelAnimationFrame(frame);
  };
}

function ContainerScroller({ children }: { readonly children?: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // SimpleBar, a child, sets its attributes in its own effect, which runs before this one.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null) return undefined;
    const stopRouting = routeKeysToScroller(scroller);
    const stopKeeping = keepOffsetThroughPrint(scroller);
    return () => {
      stopRouting();
      stopKeeping();
    };
  }, []);

  return (
    <ScrollerContext.Provider value={scrollerRef}>
      <ScrollbarContainer className={`${PAGE_SCROLLER_CLASS} h-dvh`} autoHide={false} scrollableNodeProps={{ ref: scrollerRef }}>
        {children}
      </ScrollbarContainer>
    </ScrollerContext.Provider>
  );
}

interface PageScrollerProps {
  readonly scroll: PageScroll;
  readonly children?: ReactNode;
}

function DocumentScroller({ children }: { readonly children?: ReactNode }) {
  useEffect(() => keepOffsetThroughPrint(document.scrollingElement ?? document.documentElement), []);
  return <>{children}</>;
}

/** Where `scroll` is `container`, the header, the page and the footer all scroll inside it. */
export function PageScroller({ scroll, children }: PageScrollerProps) {
  return scroll === "container" ? <ContainerScroller>{children}</ContainerScroller> : <DocumentScroller>{children}</DocumentScroller>;
}

/**
 * A browser restores the offset on Back and Forward for a scrolling document, never for an element inside it. Sits inside
 * the router, under PageScroller.
 */
export function ScrollMemory() {
  const scrollerRef = useContext(ScrollerContext);
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const offsets = useRef<Map<string, number>>(new Map());
  const currentKey = useRef(key);

  useEffect(() => {
    const scroller = scrollerRef?.current;
    if (scroller === null || scroller === undefined) return undefined;
    const remember = () => {
      offsets.current.set(currentKey.current, scroller.scrollTop);
    };
    remember();
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", remember);
    };
  }, [scrollerRef]);

  // After the new page's elements are in place and before paint, so an offset lands on the page it belongs to. On the
  // first render the scroller's ref is not attached yet (a child's layout effect runs first); the effect above records it.
  useLayoutEffect(() => {
    currentKey.current = key;
    const scroller = scrollerRef?.current;
    if (scroller === null || scroller === undefined) return;
    const offset = offsets.current.get(key);
    if (navigationType === NavigationType.Pop && offset !== undefined) scroller.scrollTo({ top: offset, behavior: "instant" });
    else offsets.current.set(key, scroller.scrollTop);
  }, [key, navigationType, scrollerRef]);

  return null;
}
