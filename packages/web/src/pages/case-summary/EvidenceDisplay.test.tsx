import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestDataProvider, testFoundLookup, testOkMetaEvidence } from "../../test/data";
import { EvidenceDisplay } from "./EvidenceDisplay";

const DISPLAY_URI = "/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html";
const ROW = "Evidence display";
const OWNER = "Shown by the arbitrable application";
/** `--acc-collapse`, which jsdom cannot read, so the display falls back to the same value. */
const FOLD_MS = 250;
/** `--display-reveal`, which jsdom cannot read, so the skeleton's removal falls back to the same value. */
const REVEAL_MS = 400;
const UNFOLD = "animate-[t-acc-unfold_var(--acc-expand)_var(--acc-ease)_backwards]";
/** How long the page may take to load before the skeleton shows and the status says it is loading. */
const COVER_DELAY_MS = 200;
const COVER_FADE = ["transition-opacity", "duration-(--display-reveal)", "ease-(--reveal-ease)", "motion-reduce:transition-none"];

function stylesheet(): string {
  return readFileSync(resolve(import.meta.dirname, "../../index.css"), "utf8");
}

/** The declarations of the first block whose prelude is exactly `prelude`, braces matched. */
function cssBlock(css: string, prelude: string): string {
  const start = css.indexOf(`${prelude} {`);
  if (start === -1) throw new Error(`the stylesheet has no ${prelude} block`);
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(css.indexOf("{", start) + 1, index);
  }
  throw new Error(`the ${prelude} block is never closed`);
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderDisplay(evidenceDisplayInterfaceURI: string | null = DISPLAY_URI) {
  const { metaEvidence } = testOkMetaEvidence({ evidenceDisplayInterfaceURI });
  return render(
    <TestDataProvider>
      <EvidenceDisplay metaEvidence={metaEvidence} chainId={1} found={testFoundLookup()} />
    </TestDataProvider>,
  );
}

function row(): HTMLElement {
  return screen.getByRole("button", { name: ROW });
}

function frame(): HTMLIFrameElement {
  const element = screen.getByTitle("Evidence display");
  if (!(element instanceof HTMLIFrameElement)) throw new Error("the evidence display is not an iframe");
  return element;
}

/** The element the row's aria-controls names: the region the row hides. */
function region(): HTMLElement {
  const id = row().getAttribute("aria-controls");
  const element = id === null ? null : document.getElementById(id);
  if (element === null) throw new Error("the row names no region");
  return element;
}

/** The box the frame is shown in, which draws the focus ring while keyboard focus is inside the frame. */
function displayWindow(): HTMLElement {
  const element = frame().closest<HTMLElement>(".dr-display-window");
  if (element === null) throw new Error("the frame is in no window");
  return element;
}

/** The skeleton laid over the frame's place while the page loads, or null once it has gone. */
function skeletonCover(): HTMLElement | null {
  return displayWindow().querySelector<HTMLElement>(".absolute");
}

function verticalBar(): Element {
  const bar = row().querySelector('path[d="M8 2v12"]');
  if (bar === null) throw new Error("the row draws no sign");
  return bar;
}

function sizeClasses(element: Element): readonly string[] {
  return [...element.classList].filter((name) => /^(?:max-|min-)?[hw]-/.test(name)).sort((a, b) => a.localeCompare(b));
}

function blockRoot(container: HTMLElement): Element {
  const root = container.firstElementChild;
  if (root === null) throw new Error("the evidence display rendered nothing");
  return root;
}

/** The text a sighted reader sees in `element`: every text node outside screen-reader-only and hidden elements. */
function visibleText(element: Element): string {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text = "";
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.closest(".sr-only, [hidden]") === null) text += node.textContent ?? "";
  }
  return text.trim();
}

/** The source appears only as the frame's src attribute: in no text and in no other attribute of the block. */
function expectSourceOnlyInSrc(root: Element, src: string): void {
  const elements = [root, ...root.querySelectorAll("*")];
  expect(elements.filter((element) => element.hasAttribute("src"))).toEqual([frame()]);
  expect(root.textContent).not.toContain(src);
  for (const element of elements) {
    for (const attribute of element.attributes) {
      if (element === frame() && attribute.name === "src") continue;
      expect(attribute.value, `${element.tagName} ${attribute.name}`).not.toContain(src);
    }
  }
}

describe("EvidenceDisplay", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the whole 360 px frame at once, with no crop and no size control", () => {
    renderDisplay();
    expect(region()).toBeVisible();
    expect(region()).toContainElement(frame());
    expect(sizeClasses(frame())).toEqual(["h-[360px]", "w-full"]);
    for (let element = frame().parentElement; element !== null && element !== region().parentElement; element = element.parentElement) {
      expect(sizeClasses(element), `${element.tagName} ${element.className}`).toEqual([]);
    }
    expect(displayWindow()).toHaveClass("overflow-clip", "rounded-base");
    expect(screen.getAllByRole("button")).toEqual([row()]);
    expect(screen.queryByText(/Show full frame|Show less/)).toBeNull();
  });

  it("names the row Evidence display, describes it by its owner and ties it to the region it hides", () => {
    renderDisplay();
    expect(row()).toHaveAccessibleName(ROW);
    expect(row()).toHaveAccessibleDescription(OWNER);
    expect(row()).toHaveAttribute("aria-expanded", "true");
    expect(row()).toHaveAttribute("aria-controls", region().id);
    expect(row().compareDocumentPosition(region())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("reads the owner to screen readers at every width and shows it from sm, beside the sections' sign", () => {
    renderDisplay();
    expect(screen.getByText(OWNER)).toHaveClass("max-sm:sr-only", "truncate");
    const dot = screen.getByText("·");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("max-sm:hidden");
    expect(row().querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(verticalBar()).toHaveClass("scale-y-0");
  });

  it("eases the row's hover fill in like the section headers below, with no press scale, and snaps under reduced motion", () => {
    renderDisplay();
    expect(row()).toHaveClass(
      "hover:bg-klerosUIComponentsMediumBlue",
      "transition-[background-color]",
      "duration-150",
      "ease-smooth-out",
      "motion-reduce:transition-none",
      "pressed:scale-100",
    );
    // The library button's own transition tweens its press scale only; merged away, it would leave the fill snapping on.
    expect(row()).not.toHaveClass("transition-transform");
    expect(row()).not.toHaveClass("transition-[background]");
  });

  it("draws the row's keyboard focus ring inside its plate, clear of the hairline above and the display below", () => {
    renderDisplay();
    expect(row()).toHaveClass("dr-display-row");
    const css = stylesheet();
    expect(cssBlock(css, `:where([role="option"], .dr-display-row)`).replaceAll(/\s+/g, "")).toBe("outline-offset:-2px;");
    expect(cssBlock(css, ".dr-display-row:is(:focus-visible, [data-focus-visible])").replaceAll(/\s+/g, "")).toBe("outline-offset:-2px;");
  });

  it("keeps the row's hover plate 4 px clear of the hairline, with the row 48 px tall in all", () => {
    const { container } = renderDisplay();
    expect(blockRoot(container)).toHaveClass("pt-1");
    expect(row()).toHaveClass("h-11", "-mx-2");
    expect(row()).not.toHaveClass("h-12");
  });

  it("pulls the card's foot padding in while the display is hidden, on the fold's clocks, and snaps under reduced motion", () => {
    vi.useFakeTimers();
    const { container } = renderDisplay();
    const root = blockRoot(container);
    expect(root).toHaveClass("transition-[margin]", "ease-(--acc-ease)", "motion-reduce:transition-none", "duration-(--acc-expand)");
    expect(root).not.toHaveClass("-mb-3");

    fireEvent.click(row());
    expect(root).toHaveClass("-mb-3", "duration-(--acc-collapse)");
    expect(root).not.toHaveClass("duration-(--acc-expand)");
    advance(FOLD_MS);
    expect(root).toHaveClass("-mb-3");

    fireEvent.click(row());
    expect(root).not.toHaveClass("-mb-3");
    expect(root).toHaveClass("duration-(--acc-expand)");
  });

  it("hides the display completely on the row and shows the same frame again on the next press", async () => {
    renderDisplay();
    const iframe = frame();
    const src = iframe.getAttribute("src");
    fireEvent.load(iframe);

    await userEvent.click(row());
    expect(row()).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(region()).toHaveAttribute("hidden");
    });
    expect(iframe).not.toBeVisible();
    expect(row()).toBeVisible();
    expect(verticalBar()).toHaveClass("scale-y-100");

    await userEvent.click(row());
    expect(row()).toHaveAttribute("aria-expanded", "true");
    expect(region()).not.toHaveAttribute("hidden");
    expect(frame()).toBe(iframe);
    expect(frame()).toHaveAttribute("src", src);
    expect(frame()).toBeVisible();
    expect(verticalBar()).toHaveClass("scale-y-0");
  });

  it("draws one hairline, above the row, and ends the shown display on its window with no closing hairline", async () => {
    const { container } = renderDisplay();
    const root = blockRoot(container);
    expect(root).toHaveClass("border-t", "border-klerosUIComponentsStroke");
    expect(region().firstElementChild).toBe(displayWindow().parentElement);
    for (const element of [root, ...root.querySelectorAll("*")]) {
      const edges = [...element.classList].filter((name) => /^border-[bty](?:-|$)/.test(name));
      expect(edges, `${element.tagName} ${element.getAttribute("class") ?? ""}`).toEqual(element === root ? ["border-t"] : []);
      expect(element).not.toHaveClass("-m-1");
      expect(element).not.toHaveClass("p-1");
    }

    await userEvent.click(row());
    await waitFor(() => {
      expect([...root.children].filter((child) => !child.hasAttribute("hidden"))).toEqual([row()]);
    });
  });

  it("moves focus from the frame to the row before the display folds away", () => {
    vi.useFakeTimers();
    renderDisplay();
    fireEvent.load(frame());
    frame().focus();
    expect(frame()).toHaveFocus();

    // A screen reader's activation: a click that does not move focus first.
    fireEvent.click(row());
    expect(region()).toHaveAttribute("inert");
    expect(row()).toHaveFocus();
    advance(FOLD_MS);
    expect(region()).toHaveAttribute("hidden");
    expect(row()).toHaveFocus();
  });

  it("keeps a folding display in place but out of reach of Tab and the pointer, and hides it when the fold ends", () => {
    vi.useFakeTimers();
    renderDisplay();
    fireEvent.load(frame());
    expect(region()).toHaveAttribute("data-open", "true");
    expect(region()).not.toHaveAttribute("inert");

    fireEvent.click(row());
    expect(row()).toHaveAttribute("aria-expanded", "false");
    expect(verticalBar()).toHaveClass("scale-y-100");
    expect(region()).toHaveAttribute("data-open", "false");
    expect(region()).toHaveAttribute("inert");
    expect(region()).not.toHaveAttribute("hidden");

    advance(FOLD_MS - 1);
    expect(region()).toHaveAttribute("inert");
    expect(region()).not.toHaveAttribute("hidden");

    advance(1);
    expect(region()).toHaveAttribute("hidden");
    expect(region()).toHaveAttribute("inert");
  });

  it("gives the display back at once when the row is pressed again during the fold, reversing it rather than replaying the unfold", () => {
    vi.useFakeTimers();
    renderDisplay();
    fireEvent.load(frame());

    fireEvent.click(row());
    advance(FOLD_MS / 2);
    fireEvent.click(row());
    expect(row()).toHaveAttribute("aria-expanded", "true");
    expect(region()).toHaveAttribute("data-open", "true");
    expect(region()).not.toHaveAttribute("inert");
    expect(region()).not.toHaveClass(UNFOLD);

    advance(FOLD_MS * 4);
    expect(region()).not.toHaveAttribute("hidden");
    expect(frame()).toBeVisible();
  });

  it("unfolds only a display shown again after it was hidden, never on the first render", () => {
    vi.useFakeTimers();
    renderDisplay();
    expect(region()).not.toHaveClass(UNFOLD);

    fireEvent.click(row());
    advance(FOLD_MS);
    expect(region()).not.toHaveClass(UNFOLD);

    fireEvent.click(row());
    expect(region()).not.toHaveAttribute("hidden");
    expect(region()).toHaveClass(UNFOLD, "motion-reduce:animate-none");

    // Folding away again starts from wherever the unfold is.
    fireEvent.click(row());
    expect(region()).not.toHaveClass(UNFOLD);
  });

  it("carries the sections' fold classes on the region: the grid track and opacity on their clocks, the reduced-motion guard, no blur", () => {
    renderDisplay();
    expect(region()).toHaveClass(
      "grid",
      "grid-rows-[1fr]",
      "data-[open=false]:grid-rows-[0fr]",
      "data-[open=false]:opacity-0",
      "transition-[grid-template-rows,opacity]",
      "duration-(--acc-expand)",
      "data-[open=false]:duration-(--acc-collapse)",
      "ease-(--acc-ease)",
      "motion-reduce:transition-none",
    );
    expect([...region().children]).toHaveLength(1);
    expect(region().firstElementChild).toHaveClass("overflow-hidden");
    for (const element of [region(), ...region().querySelectorAll("*")]) {
      expect(element.getAttribute("class") ?? "", `${element.tagName} ${element.getAttribute("class") ?? ""}`).not.toMatch(/blur/);
    }
  });

  it("holds the skeleton back for 200 ms on a timer rather than an animation delay, so whatever the motion preference, then fades it in by opacity alone", () => {
    vi.useFakeTimers();
    renderDisplay();
    expect(skeletonCover()).toHaveClass("opacity-0", ...COVER_FADE);
    expect(skeletonCover()).not.toHaveClass("opacity-100");
    expect([...(skeletonCover()?.classList ?? [])].filter((name) => /^(?:motion-reduce:)?animate-/.test(name))).toEqual([]);

    advance(COVER_DELAY_MS - 1);
    expect(skeletonCover()).toHaveClass("opacity-0");
    expect(skeletonCover()).not.toHaveClass("opacity-100");

    advance(1);
    expect(skeletonCover()).toHaveClass("opacity-100", ...COVER_FADE);
    expect(skeletonCover()).not.toHaveClass("opacity-0");
    expect(skeletonCover()).not.toHaveClass("pointer-events-none");
  });

  it("switches a skeleton still fading in to its fade-out on the same opacity transition when the page loads", () => {
    vi.useFakeTimers();
    renderDisplay();
    advance(COVER_DELAY_MS + 100);
    fireEvent.load(frame());
    expect(skeletonCover()).toHaveClass("opacity-0", "pointer-events-none", ...COVER_FADE);
    expect(skeletonCover()).not.toHaveClass("opacity-100");
  });

  it("never shows the skeleton when the page loads within 200 ms", () => {
    vi.useFakeTimers();
    renderDisplay();
    advance(COVER_DELAY_MS / 2);
    fireEvent.load(frame());
    advance(COVER_DELAY_MS);
    expect(skeletonCover()).toHaveClass("opacity-0", "pointer-events-none");
    expect(skeletonCover()).not.toHaveClass("opacity-100");
  });

  it("shows the frame at its load event with no fade of its own, the skeleton alone fading out over it", () => {
    renderDisplay();
    const holder = frame().parentElement;
    expect(holder).toHaveClass("invisible");
    expect(holder?.classList).toHaveLength(1);

    fireEvent.load(frame());
    expect(holder?.classList).toHaveLength(0);
    expect(skeletonCover()).toHaveClass(...COVER_FADE, "opacity-0", "pointer-events-none");
    expect(skeletonCover()).not.toHaveClass("opacity-100");
  });

  it("times the skeleton's fade-out on a 400 ms display clock of its own, leaving the shared reveal and fold clocks alone", () => {
    const css = stylesheet();
    expect(css).toMatch(/--display-reveal:\s*400ms;/);
    expect(css).toMatch(/--reveal-dur:\s*400ms;/);
    expect(css).toMatch(/--acc-collapse:\s*250ms;/);
  });

  it("outlines the display window with the Stroke in light only, giving way to the focus ring", () => {
    const css = stylesheet();
    expect(cssBlock(css, ":where(:root:not(.dark)) .dr-display-window").replaceAll(/\s+/g, "")).toBe("outline:1pxsolidvar(--klerosUIComponentsStroke);outline-offset:-1px;");
    expect(cssBlock(css, ".dr-display-window[data-frame-focus]").replaceAll(/\s+/g, "")).toBe("outline:2pxsolidvar(--dr-display-focus);outline-offset:-2px;");
  });

  it("keeps the paper under the frame from the first paint, with the skeleton's bars toned for the paper and inset from its edges", () => {
    renderDisplay();
    expect(displayWindow()).toHaveClass("bg-(--dr-display-paper)");
    expect(skeletonCover()).toHaveClass("[&_.animate-loading]:bg-(--dr-display-skeleton)", "p-4");
    expect(frame()).toHaveClass("bg-(--dr-display-paper)");
  });

  it("lets the pointer through the fading skeleton and drops it once its fade has run", () => {
    vi.useFakeTimers();
    renderDisplay();
    fireEvent.load(frame());
    expect(skeletonCover()).toHaveClass("opacity-0", "pointer-events-none");
    expect(skeletonCover()).toHaveAttribute("aria-hidden", "true");

    advance(REVEAL_MS - 1);
    expect(skeletonCover()).not.toBeNull();
    advance(1);
    expect(skeletonCover()).toBeNull();
    expect([...displayWindow().children]).toEqual([frame().parentElement]);
  });

  it("leaves focus where it is when the display is hidden from the row", async () => {
    renderDisplay();
    await userEvent.click(row());
    expect(row()).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(row()).toHaveAttribute("aria-expanded", "true");
    expect(row()).toHaveFocus();
  });

  it("covers the frame's place with the section skeleton until the page loads, then shows the frame", () => {
    vi.useFakeTimers();
    renderDisplay();
    const iframe = frame();
    expect(skeletonCover()?.querySelector(".animate-loading")).not.toBeNull();
    expect(skeletonCover()).toHaveClass("absolute", "inset-0");
    expect(skeletonCover()).not.toHaveClass("pointer-events-none");
    // In layout, so the skeleton has the frame's 360 px to fill, but neither seen, focused nor clicked.
    expect(iframe.closest("[hidden]")).toBeNull();
    expect(iframe.parentElement).toHaveClass("invisible");

    fireEvent.load(iframe);
    advance(REVEAL_MS);
    expect(skeletonCover()).toBeNull();
    expect(frame()).toBe(iframe);
    expect(iframe.closest(".invisible")).toBeNull();
    expect([...displayWindow().children]).toEqual([iframe.parentElement]);
    iframe.focus();
    expect(iframe).toHaveFocus();
  });

  it("tells screen readers only that the page is loading, with no visible text and no later message", () => {
    vi.useFakeTimers();
    renderDisplay();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("sr-only");
    expect(status).not.toHaveAttribute("aria-busy");
    expect(status).toBeEmptyDOMElement();
    expect(region()).toContainElement(status);
    expect(displayWindow()).not.toContainElement(status);
    expect(displayWindow()).toHaveAttribute("aria-busy", "true");

    advance(COVER_DELAY_MS - 50);
    expect(status).toBeEmptyDOMElement();
    advance(50);
    expect(status).toHaveTextContent(/^Loading…$/);
    expect(skeletonCover()).toHaveClass("opacity-100");
    expect(status.textContent).not.toContain(frame().getAttribute("src") ?? "");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent(/^Loading…$/);
    expect(visibleText(region())).toBe("");

    fireEvent.load(frame());
    expect(screen.queryByRole("status")).toBeNull();
    expect(displayWindow()).not.toHaveAttribute("aria-busy");
    expect(visibleText(region())).toBe("");
  });

  it("marks the window while a Tab puts focus inside the frame, and clears it when focus comes back to the page", async () => {
    renderDisplay();
    const activeElement = vi.spyOn(document, "activeElement", "get");
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");

    activeElement.mockReturnValue(frame());
    fireEvent.keyDown(document, { key: "Tab" });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).toHaveAttribute("data-frame-focus");

    activeElement.mockReturnValue(row());
    fireEvent.focusIn(row());
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");
  });

  it("marks the window when a Shift+Tab from below puts focus back inside the frame", async () => {
    renderDisplay();
    vi.spyOn(document, "activeElement", "get").mockReturnValue(frame());
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).toHaveAttribute("data-frame-focus");
  });

  it("leaves the window unmarked when a pointer click puts focus inside the frame", async () => {
    renderDisplay();
    const activeElement = vi.spyOn(document, "activeElement", "get").mockReturnValue(document.body);
    // A click into the frame only blurs this window; the frame becomes the active element a moment later.
    fireEvent.blur(window);
    activeElement.mockReturnValue(frame());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");
  });

  it("leaves the window unmarked when the page loses focus to another window while focus is outside the frame", async () => {
    renderDisplay();
    vi.spyOn(document, "activeElement", "get").mockReturnValue(row());
    fireEvent.blur(window);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");
  });

  it("leaves the window unmarked when a Tab lands outside the frame", async () => {
    renderDisplay();
    vi.spyOn(document, "activeElement", "get").mockReturnValue(row());
    fireEvent.keyDown(document, { key: "Tab" });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");
  });

  it("never puts the frame's source anywhere but the src attribute, before and after loading, hiding and showing", async () => {
    const posted = vi.fn();
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    if (descriptor?.get === undefined) throw new Error("jsdom exposes no contentWindow getter");
    const contentWindow = vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function (this: HTMLIFrameElement) {
      const frameWindow = descriptor.get?.call(this) as Window | null;
      if (frameWindow !== null) frameWindow.postMessage = posted;
      return frameWindow;
    });
    const { container } = renderDisplay();
    const root = blockRoot(container);
    const src = frame().getAttribute("src") ?? "";
    expect(src).toMatch(/^https:\/\//);
    // jsdom reads contentWindow itself when it inserts the frame, so only the reads after mount are the app's.
    const readsAtMount = contentWindow.mock.calls.length;

    expectSourceOnlyInSrc(root, src);

    fireEvent.load(frame());
    expectSourceOnlyInSrc(root, src);

    await userEvent.click(row());
    expectSourceOnlyInSrc(root, src);

    await userEvent.click(row());
    expectSourceOnlyInSrc(root, src);

    fireEvent.load(frame());
    expectSourceOnlyInSrc(root, src);
    expect(contentWindow).toHaveBeenCalledTimes(readsAtMount);
    expect(posted).not.toHaveBeenCalled();
  });

  it("renders nothing when the meta-evidence names no display", () => {
    const { container } = renderDisplay(null);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
