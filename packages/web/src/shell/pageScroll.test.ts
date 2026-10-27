import { afterEach, describe, expect, it, vi } from "vitest";
import { choosePageScroll } from "./pageScroll";

/** Gives every element `scrollbarWidth` px of scrollbar between its border box and its client box, as a classic scrollbar takes. */
function scrollbarsTake(scrollbarWidth: number): void {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100 + scrollbarWidth);
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(100);
}

function freshRoot(): HTMLElement {
  return document.implementation.createHTMLDocument("").documentElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("choosePageScroll", () => {
  it("keeps the document scrolling where scrollbars overlay the page and leaves the root unmarked", () => {
    scrollbarsTake(0);
    const root = freshRoot();
    expect(choosePageScroll(root)).toBe("document");
    expect(root.hasAttribute("data-page-scroll")).toBe(false);
  });

  it("moves the page into the page scroller where the scrollbar takes layout space, and marks the root for the stylesheet", () => {
    scrollbarsTake(15);
    const root = freshRoot();
    expect(choosePageScroll(root)).toBe("container");
    expect(root.getAttribute("data-page-scroll")).toBe("container");
  });

  it("measures with a scrolling probe it removes again", () => {
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
