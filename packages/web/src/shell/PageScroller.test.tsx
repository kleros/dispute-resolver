import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, type ReactNode } from "react";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";
import { PageScroller, ScrollMemory } from "./PageScroller";
import type { PageScroll } from "./pageScroll";

function Page({ extra }: { readonly extra?: ReactNode }) {
  return (
    <>
      <header>
        <button type="button">Brand</button>
      </header>
      <main>
        <p>Plain text</p>
        {extra}
        <button type="button">Action</button>
      </main>
    </>
  );
}

function renderPage(scroll: PageScroll, extra?: ReactNode) {
  const ui = (content?: ReactNode) => (
    <StrictMode>
      <PageScroller scroll={scroll}>
        <Page extra={content} />
      </PageScroller>
    </StrictMode>
  );
  const result = render(ui(extra));
  return {
    ...result,
    rerenderWith: (content?: ReactNode) => {
      result.rerender(ui(content));
    },
  };
}

function pageScroller(): HTMLElement {
  const scroller = document.querySelector(".dr-page-scroller .simplebar-content-wrapper");
  if (!(scroller instanceof HTMLElement)) throw new Error("No page scroller is rendered.");
  return scroller;
}

function scrollerRoot(): HTMLElement {
  const root = document.querySelector(".dr-page-scroller");
  if (!(root instanceof HTMLElement)) throw new Error("No page scroller is rendered.");
  return root;
}

function press(target: Element, key: string, modifiers: { readonly shiftKey?: boolean; readonly ctrlKey?: boolean; readonly altKey?: boolean; readonly metaKey?: boolean } = {}) {
  fireEvent.keyDown(target, { key, ...modifiers });
}

/** The page scroller can take the focus but sits out of the tab order. */
function expectOutOfTabOrder(scroller: HTMLElement) {
  expect(scroller).toHaveAttribute("tabindex", "-1");
}

describe("PageScroller where the document scrolls the page", () => {
  it("renders the page as it is, with no page scroller around it", () => {
    const { container } = renderPage("document");
    expect(document.querySelector(".dr-page-scroller")).toBeNull();
    expect(container.firstElementChild?.tagName).toBe("HEADER");
  });

  it("leaves scroll keys pressed while nothing has focus to the browser", () => {
    renderPage("document");
    press(document.body, "PageDown");
    expect(document.activeElement).toBe(document.body);
  });
});

describe("PageScroller where the page scroller scrolls the page", () => {
  it("renders the page inside the library's ScrollbarContainer, as tall as the viewport, its thumb always shown", () => {
    renderPage("container");
    const root = scrollerRoot();
    expect(root).toHaveAttribute("data-simplebar", "init");
    expect(root).toHaveClass("h-dvh");
    expect(root.querySelector(".simplebar-track.simplebar-vertical .simplebar-scrollbar")).toHaveClass("simplebar-visible");
    expect(pageScroller().querySelector(".simplebar-content > header")).not.toBeNull();
  });

  it("adds no tab stop and no landmark, so the first Tab still reaches the page's first control", async () => {
    renderPage("container");
    const scroller = pageScroller();
    expectOutOfTabOrder(scroller);
    expect(scroller).not.toHaveAttribute("role");
    expect(scroller).not.toHaveAttribute("aria-label");
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Brand" })).toHaveFocus();
  });

  for (const [key, shiftKey] of [
    [" ", false],
    [" ", true],
    ["PageDown", false],
    ["PageUp", false],
    ["End", false],
    ["Home", false],
    ["ArrowDown", false],
    ["ArrowUp", false],
  ] as const) {
    const name = `${shiftKey ? "Shift+" : ""}${key === " " ? "Space" : key}`;
    it(`${name} pressed while nothing has focus hands the focus to the page scroller, so the browser scrolls the page`, () => {
      renderPage("container");
      press(document.body, key, { shiftKey });
      const scroller = pageScroller();
      expect(scroller).toHaveFocus();
      expectOutOfTabOrder(scroller);
    });
  }

  it("keys that do not scroll, and scroll keys with Ctrl, Alt or Meta, leave the focus where it is", () => {
    renderPage("container");
    press(document.body, "a");
    press(document.body, "Enter");
    press(document.body, "End", { ctrlKey: true });
    press(document.body, "ArrowDown", { altKey: true });
    press(document.body, "PageDown", { metaKey: true });
    expect(document.activeElement).toBe(document.body);
  });

  it("a scroll key the page has already handled is left to it", () => {
    renderPage("container");
    const handled = (event: KeyboardEvent) => {
      event.preventDefault();
    };
    document.addEventListener("keydown", handled);
    press(document.body, "PageDown");
    document.removeEventListener("keydown", handled);
    expect(document.activeElement).toBe(document.body);
  });

  it("a scroll key pressed on a focused control is left to the browser", () => {
    renderPage("container");
    const action = screen.getByRole("button", { name: "Action" });
    action.focus();
    press(action, "PageDown");
    expect(action).toHaveFocus();
  });

  it("after a press on the page's content the keys are left to the browser, which scrolls from where the press landed", () => {
    renderPage("container");
    const text = screen.getByText("Plain text");
    fireEvent.pointerDown(text);
    fireEvent.pointerUp(text);
    press(document.body, "PageDown");
    expect(document.activeElement).toBe(document.body);
  });

  it("a press on content that has since left the page no longer counts", () => {
    const { rerenderWith } = renderPage("container", <p>Leaving text</p>);
    fireEvent.pointerDown(screen.getByText("Leaving text"));
    rerenderWith();
    press(document.body, "PageDown");
    expect(pageScroller()).toHaveFocus();
  });

  it("lifts the scroller's focus stop while a press lasts, so the press moves the focus as it would on a page without one", () => {
    renderPage("container");
    const scroller = pageScroller();
    const text = screen.getByText("Plain text");
    fireEvent.pointerDown(text);
    expect(scroller).not.toHaveAttribute("tabindex");
    fireEvent.pointerUp(text);
    expectOutOfTabOrder(scroller);
    fireEvent.pointerDown(text);
    fireEvent.pointerCancel(text);
    expectOutOfTabOrder(scroller);
  });

  it("puts the focus stop back at the next key when a press ended outside the page", () => {
    renderPage("container");
    fireEvent.pointerDown(screen.getByText("Plain text"));
    press(document.body, "Tab");
    expectOutOfTabOrder(pageScroller());
  });

  it.each([
    { name: "Tab", shiftKey: false, edge: "start", child: "firstElementChild", next: "Brand" },
    { name: "Shift+Tab", shiftKey: true, edge: "end", child: "lastElementChild", next: "Action" },
  ] as const)("$name from the page scroller leaves from a passing stop at the page's $edge, as from a page with nothing focused", ({ shiftKey, child, next }) => {
    renderPage("container");
    press(document.body, "PageDown");
    const scroller = pageScroller();
    press(scroller, "Tab", { shiftKey });
    const stop = scroller[child];
    expect(stop?.tagName).toBe("SPAN");
    expect(stop).toHaveFocus();
    expect(stop).toHaveAttribute("tabindex", "-1");
    screen.getByRole("button", { name: next }).focus();
    expect(scroller.querySelector(":scope > span")).toBeNull();
  });

  it("Tab while something else has focus is left to the browser", () => {
    renderPage("container");
    const action = screen.getByRole("button", { name: "Action" });
    action.focus();
    press(action, "Tab");
    expect(action).toHaveFocus();
    expect(pageScroller().querySelector(":scope > span")).toBeNull();
  });

  it("stops routing the keys once it unmounts", () => {
    const { unmount } = renderPage("container");
    unmount();
    press(document.body, "PageDown");
    expect(document.activeElement).toBe(document.body);
  });
});

/** Stands for the browser: the scroll offset the page scroller reports and takes, as jsdom lays nothing out. */
function trackScrollTop(scroller: HTMLElement): { set: (top: number) => void } {
  let top = 0;
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  Object.defineProperty(scroller, "scrollTo", {
    configurable: true,
    value: (options: ScrollToOptions) => {
      top = options.top ?? top;
    },
  });
  return {
    set: (value) => {
      top = value;
      fireEvent.scroll(scroller);
    },
  };
}

describe("PageScroller through a print", () => {
  for (const scroll of ["container", "document"] as const) {
    it(`where the ${scroll === "container" ? "page scroller" : "document"} scrolls the page, puts the page back where it was once the print ends, wherever the print's layout left it`, async () => {
      const { unmount } = renderPage(scroll);
      const scrolling = scroll === "container" ? pageScroller() : document.documentElement;
      const offset = trackScrollTop(scrolling);
      try {
        offset.set(606);
        fireEvent(window, new Event("beforeprint"));
        offset.set(494);
        fireEvent(window, new Event("afterprint"));
        await waitFor(() => {
          expect(scrolling.scrollTop).toBe(606);
        });
      } finally {
        unmount();
        Reflect.deleteProperty(scrolling, "scrollTop");
        Reflect.deleteProperty(scrolling, "scrollTo");
      }
    });
  }
});

function HistoryButtons() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => void navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        Forward
      </button>
    </>
  );
}

function renderRoutes(scroll: PageScroll) {
  return render(
    <PageScroller scroll={scroll}>
      <MemoryRouter initialEntries={["/list"]}>
        <ScrollMemory />
        <HistoryButtons />
        <Routes>
          <Route path="/list" element={<Link to="/case">Open the case</Link>} />
          <Route path="/case" element={<Link to="/other">Open another page</Link>} />
          <Route path="/other" element={<p>Another page</p>} />
        </Routes>
      </MemoryRouter>
    </PageScroller>,
  );
}

describe("ScrollMemory", () => {
  it("Back and Forward return each page to where it was scrolled, as the browser does for a scrolling document", async () => {
    renderRoutes("container");
    const scroller = pageScroller();
    const offset = trackScrollTop(scroller);
    offset.set(640);
    await userEvent.click(screen.getByRole("link", { name: "Open the case" }));
    offset.set(120);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("link", { name: "Open the case" })).toBeInTheDocument();
    expect(scroller.scrollTop).toBe(640);
    await userEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.getByRole("link", { name: "Open another page" })).toBeInTheDocument();
    expect(scroller.scrollTop).toBe(120);
  });

  it("a new page keeps the offset the browser leaves it, as a scrolling document does", async () => {
    renderRoutes("container");
    const scroller = pageScroller();
    const offset = trackScrollTop(scroller);
    offset.set(300);
    await userEvent.click(screen.getByRole("link", { name: "Open the case" }));
    expect(scroller.scrollTop).toBe(300);
  });

  it("does nothing where the document scrolls the page, which the browser restores itself", async () => {
    renderRoutes("document");
    await userEvent.click(screen.getByRole("link", { name: "Open the case" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(document.querySelector(".dr-page-scroller")).toBeNull();
    expect(screen.getByRole("link", { name: "Open the case" })).toBeInTheDocument();
  });
});
