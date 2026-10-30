import { afterEach, describe, expect, it, vi } from "vitest";
import { matchOnly } from "../test/matchMedia";
import { choosePageScroll } from "./pageScroll";

const DESKTOP_POINTER = "(hover: hover) and (pointer: fine)";

/** Gives every element `scrollbarWidth` px of scrollbar between its border box and its client box, as a classic scrollbar takes. */
function scrollbarsTake(scrollbarWidth: number): void {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100 + scrollbarWidth);
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(100);
}

function pointerHoversFinely(): void {
  vi.stubGlobal("matchMedia", matchOnly([DESKTOP_POINTER]));
}

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
  it.each([
    ["keeps the document scrolling on a touch device whose scrollbars overlay the page, and leaves the root unmarked", pointerIsTouch, 0, "document"],
    ["moves the page into the page scroller on a desktop whose scrollbars overlay the page, as a Mac's do by default", pointerHoversFinely, 0, "container"],
    ["moves the page into the page scroller where the scrollbar takes layout space, and marks the root for the stylesheet", pointerHoversFinely, 15, "container"],
    ["moves the page into the page scroller where the scrollbar takes layout space even when a finger leads, as on a touch laptop", pointerIsTouch, 15, "container"],
  ] as const)("%s", (_name, pointer, width, expected) => {
    pointer();
    scrollbarsTake(width);
    const root = freshRoot();
    expect(choosePageScroll(root)).toBe(expected);
    expect(root.getAttribute("data-page-scroll")).toBe(expected === "container" ? "container" : null);
    expect(root.ownerDocument.body.children).toHaveLength(0);
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
});
