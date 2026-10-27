import { afterEach, describe, expect, it, vi } from "vitest";
import { matchOnly } from "../test/matchMedia";
import { choosePageScroll } from "./pageScroll";

const DESKTOP_POINTER = "(hover: hover) and (pointer: fine)";

/** Gives every element `scrollbarWidth` px of scrollbar between its border box and its client box, as a classic scrollbar takes. */
function scrollbarsTake(scrollbarWidth: number): void {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100 + scrollbarWidth);
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(100);
}

/** A mouse or trackpad leads, as on a desktop or a laptop. */
function pointerHoversFinely(): void {
  vi.stubGlobal("matchMedia", matchOnly([DESKTOP_POINTER]));
}

/** A finger leads, as on a phone or a tablet. */
function pointerIsTouch(): void {
  vi.stubGlobal("matchMedia", matchOnly(["(hover: none)", "(pointer: coarse)"]));
}

function freshRoot(): HTMLElement {
  return document.implementation.createHTMLDocument("").documentElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("choosePageScroll", () => {
  it("keeps the document scrolling on a touch device whose scrollbars overlay the page, and leaves the root unmarked", () => {
    pointerIsTouch();
    scrollbarsTake(0);
    const root = freshRoot();
    expect(choosePageScroll(root)).toBe("document");
    expect(root.hasAttribute("data-page-scroll")).toBe(false);
  });

  it("moves the page into the page scroller on a desktop whose scrollbars overlay the page, as a Mac's do by default", () => {
    pointerHoversFinely();
    scrollbarsTake(0);
    const root = freshRoot();
    expect(choosePageScroll(root)).toBe("container");
    expect(root.getAttribute("data-page-scroll")).toBe("container");
  });

  it("moves the page into the page scroller where the scrollbar takes layout space, and marks the root for the stylesheet", () => {
    pointerHoversFinely();
    scrollbarsTake(15);
    const root = freshRoot();
    expect(choosePageScroll(root)).toBe("container");
    expect(root.getAttribute("data-page-scroll")).toBe("container");
  });

  it("moves the page into the page scroller where the scrollbar takes layout space even when a finger leads, as on a touch laptop", () => {
    pointerIsTouch();
    scrollbarsTake(15);
    const root = freshRoot();
    expect(choosePageScroll(root)).toBe("container");
    expect(root.getAttribute("data-page-scroll")).toBe("container");
  });

  it("lets the scrollbar decide where the browser cannot answer media queries", () => {
    vi.stubGlobal("matchMedia", undefined);
    scrollbarsTake(0);
    expect(choosePageScroll(freshRoot())).toBe("document");
    scrollbarsTake(15);
    expect(choosePageScroll(freshRoot())).toBe("container");
  });

  it("measures with a scrolling probe it removes again where a finger leads", () => {
    pointerIsTouch();
    const root = freshRoot();
    const body = root.ownerDocument.body;
    const measured: { readonly overflow: string; readonly inBody: boolean }[] = [];
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      measured.push({ overflow: this.style.overflow, inBody: this.parentElement === body });
      return 117;
    });
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(100);
    expect(choosePageScroll(root)).toBe("container");
    expect(measured).toEqual([{ overflow: "scroll", inBody: true }]);
    expect(body.children).toHaveLength(0);
  });

  it("lays nothing out to decide on a desktop, where the pointer alone settles it", () => {
    pointerHoversFinely();
    const offsetWidth = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get");
    const root = freshRoot();
    expect(choosePageScroll(root)).toBe("container");
    expect(offsetWidth).not.toHaveBeenCalled();
    expect(root.ownerDocument.body.children).toHaveLength(0);
  });
});
