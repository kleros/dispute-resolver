import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestDataProvider, testFoundLookup, testOkMetaEvidence } from "../../test/data";
import { EvidenceDisplay } from "./EvidenceDisplay";

const DISPLAY_URI = "/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html";
const SHOW_FULL = "Show full frame";
const SHOW_LESS = "Show less";

function renderDisplay(evidenceDisplayInterfaceURI: string | null = DISPLAY_URI) {
  const { metaEvidence } = testOkMetaEvidence({ evidenceDisplayInterfaceURI });
  return render(
    <TestDataProvider>
      <EvidenceDisplay metaEvidence={metaEvidence} chainId={1} found={testFoundLookup()} />
    </TestDataProvider>,
  );
}

function toggle(): HTMLElement {
  return screen.getByRole("button", { name: /^Show (?:full frame|less)$/ });
}

function frame(): HTMLIFrameElement {
  const element = screen.getByTitle("Evidence display");
  if (!(element instanceof HTMLIFrameElement)) throw new Error("the evidence display is not an iframe");
  return element;
}

/** The element the control's aria-controls names: the window that clips the frame. */
function displayWindow(): HTMLElement {
  const id = toggle().getAttribute("aria-controls");
  const element = id === null ? null : document.getElementById(id);
  if (element === null) throw new Error("the control names no window");
  return element;
}

function sizeClasses(element: Element): readonly string[] {
  return [...element.classList].filter((name) => /^(?:max-|min-)?[hw]-/.test(name)).sort((a, b) => a.localeCompare(b));
}

function blockRoot(container: HTMLElement): Element {
  const root = container.firstElementChild;
  if (root === null) throw new Error("the evidence display rendered nothing");
  return root;
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
    vi.restoreAllMocks();
  });

  it("shows the top 256 px of the frame and the full 360 px after Show full frame", async () => {
    renderDisplay();
    const iframe = frame();
    const src = iframe.getAttribute("src");
    expect(displayWindow()).toHaveClass("h-[256px]", "overflow-clip", "rounded-base");
    expect(sizeClasses(iframe)).toEqual(["h-[360px]", "w-full"]);

    await userEvent.click(screen.getByRole("button", { name: SHOW_FULL }));
    expect(displayWindow()).toHaveClass("h-[360px]");
    expect(displayWindow()).not.toHaveClass("h-[256px]");
    expect(screen.getByRole("button", { name: SHOW_LESS })).toBeInTheDocument();
    expect(frame()).toBe(iframe);
    expect(frame()).toHaveAttribute("src", src);
    expect(sizeClasses(frame())).toEqual(["h-[360px]", "w-full"]);

    await userEvent.click(screen.getByRole("button", { name: SHOW_LESS }));
    expect(displayWindow()).toHaveClass("h-[256px]");
    expect(displayWindow()).not.toHaveClass("h-[360px]");
    expect(screen.getByRole("button", { name: SHOW_FULL })).toBeInTheDocument();
    expect(frame()).toBe(iframe);
    expect(frame()).toHaveAttribute("src", src);
    expect(sizeClasses(frame())).toEqual(["h-[360px]", "w-full"]);
  });

  it("tweens only the window's height between the two states and snaps under reduced motion", async () => {
    renderDisplay();
    const motion = ["transition-[height]", "duration-(--resize-dur)", "ease-(--resize-ease)", "motion-reduce:transition-none"];
    expect(displayWindow()).toHaveClass(...motion);
    expect(frame().className).not.toMatch(/transition|animate|opacity|blur|scale/);

    await userEvent.click(screen.getByRole("button", { name: SHOW_FULL }));
    expect(displayWindow()).toHaveClass(...motion, "rounded-base", "overflow-clip");
    expect(displayWindow().parentElement).toHaveClass("border-b");
  });

  it("names the control for the frame and ties it to the window", async () => {
    renderDisplay();
    const control = screen.getByRole("button", { name: SHOW_FULL });
    expect(control).toHaveAttribute("aria-expanded", "false");
    expect(control).toHaveAttribute("aria-controls", displayWindow().id);
    const labelId = control.getAttribute("aria-describedby");
    const label = labelId === null ? null : document.getElementById(labelId);
    expect(label).toHaveTextContent(/^Evidence display · Shown by the arbitrable application$/);
    expect(control).toHaveClass("min-w-42", "ml-auto", "shrink-0");
    expect(label?.parentElement).toHaveClass("flex-wrap");

    await userEvent.click(control);
    expect(screen.getByRole("button", { name: SHOW_LESS })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows a Loading status until the frame loads", async () => {
    renderDisplay();
    const src = frame().getAttribute("src") ?? "";
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).not.toHaveAttribute("aria-busy");
    expect(status).toBeEmptyDOMElement();
    expect(displayWindow()).toHaveAttribute("aria-busy", "true");

    expect(await within(status).findByText("Loading…")).toBeInTheDocument();
    expect(status.textContent).not.toContain(src);

    fireEvent.load(frame());
    expect(screen.queryByRole("status")).toBeNull();
    expect(displayWindow()).not.toHaveAttribute("aria-busy");
  });

  it("shows only the frame's paper while the page loads, with no skeleton over it", () => {
    renderDisplay();
    const iframe = frame();
    expect([...displayWindow().children]).toEqual([iframe]);
    expect(iframe).toHaveClass("bg-(--dr-display-paper)");
    expect(displayWindow().querySelector(".animate-loading")).toBeNull();

    fireEvent.load(iframe);
    expect([...displayWindow().children]).toEqual([iframe]);
    expect(iframe.className).not.toMatch(/transition|animate|opacity|blur|scale/);
  });

  it("marks the window while a Tab puts focus inside the frame, and clears it when focus comes back to the page", async () => {
    renderDisplay();
    const activeElement = vi.spyOn(document, "activeElement", "get");
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");

    activeElement.mockReturnValue(frame());
    fireEvent.keyDown(document, { key: "Tab" });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).toHaveAttribute("data-frame-focus");

    activeElement.mockReturnValue(toggle());
    fireEvent.focusIn(toggle());
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");
  });

  it("marks the window when a Shift+Tab from below puts focus back inside the frame", async () => {
    renderDisplay();
    vi.spyOn(document, "activeElement", "get").mockReturnValue(frame());
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).toHaveAttribute("data-frame-focus");
  });

  it("leaves the window as it is when a pointer click puts focus inside the frame", async () => {
    renderDisplay();
    const activeElement = vi.spyOn(document, "activeElement", "get").mockReturnValue(document.body);
    // A click into the frame only blurs this window; the frame becomes the active element a moment later.
    fireEvent.blur(window);
    activeElement.mockReturnValue(frame());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");
    expect(displayWindow()).toHaveClass("h-[256px]");
  });

  it("a pointer click inside the expanded frame keeps the full frame and draws no mark", async () => {
    renderDisplay();
    await userEvent.click(screen.getByRole("button", { name: SHOW_FULL }));
    const activeElement = vi.spyOn(document, "activeElement", "get").mockReturnValue(document.body);
    fireEvent.blur(window);
    activeElement.mockReturnValue(frame());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");
    expect(displayWindow()).toHaveClass("h-[360px]");
  });

  it("leaves the window unmarked when the page loses focus to another window while focus is outside the frame", async () => {
    renderDisplay();
    vi.spyOn(document, "activeElement", "get").mockReturnValue(toggle());
    fireEvent.blur(window);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");
  });

  it("leaves the window unmarked when a Tab lands outside the frame", async () => {
    renderDisplay();
    vi.spyOn(document, "activeElement", "get").mockReturnValue(toggle());
    fireEvent.keyDown(document, { key: "Tab" });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(displayWindow()).not.toHaveAttribute("data-frame-focus");
  });

  it("reads the owner to screen readers at every width", () => {
    renderDisplay();
    expect(screen.getByText("Shown by the arbitrable application")).toHaveClass("max-sm:sr-only");
    const dot = screen.getByText("·");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("max-sm:hidden");
    expect(screen.getByText("Evidence display").tagName).toBe("P");
    expect(screen.getByRole("button", { name: SHOW_FULL })).toHaveAccessibleDescription("Evidence display Shown by the arbitrable application");
  });

  it("closes the window with a hairline under the sheet", () => {
    const { container } = renderDisplay();
    const root = blockRoot(container);
    expect(root).toHaveClass("border-t", "border-klerosUIComponentsStroke", "pt-4");
    expect(displayWindow().parentElement).toHaveClass("border-b", "border-klerosUIComponentsStroke");
    for (const element of [root, ...root.querySelectorAll("*")]) {
      expect(element).not.toHaveClass("-m-1");
      expect(element).not.toHaveClass("p-1");
    }
  });

  it("never puts the frame's source anywhere but the src attribute, before and after loading and toggling", async () => {
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

    await userEvent.click(screen.getByRole("button", { name: SHOW_FULL }));
    expectSourceOnlyInSrc(root, src);

    await userEvent.click(screen.getByRole("button", { name: SHOW_LESS }));
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
