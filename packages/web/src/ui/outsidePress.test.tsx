import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOutsidePress } from "./outsidePress";

// Each press is the event sequence a browser sends for it; React applies the close between two events, as a browser
// lets it, so a click arrives after the menu has gone.

const MOUSE = { pointerId: 1, pointerType: "mouse", button: 0, isPrimary: true };
const TOUCH = { pointerId: 2, pointerType: "touch", button: 0, isPrimary: true };

/** A mouse press and release on `target`; whether its click reached the page unprevented. */
function mouseClick(target: Element): boolean {
  fireEvent.pointerDown(target, MOUSE);
  fireEvent.mouseDown(target, { button: 0, detail: 1 });
  fireEvent.pointerUp(target, MOUSE);
  fireEvent.mouseUp(target, { button: 0, detail: 1 });
  return fireEvent.click(target, { button: 0, detail: 1 });
}

/** A tap on `target`. The click follows the touchend, also where a browser would drop it for a cancelled touchend. */
function tap(target: Element): { readonly touchEndCancelled: boolean } {
  fireEvent.pointerDown(target, TOUCH);
  fireEvent.touchStart(target);
  fireEvent.pointerUp(target, TOUCH);
  const touchEndCancelled = !fireEvent.touchEnd(target);
  fireEvent.mouseDown(target, { button: 0, detail: 1 });
  fireEvent.mouseUp(target, { button: 0, detail: 1 });
  fireEvent.click(target, { button: 0, detail: 1 });
  return { touchEndCancelled };
}

interface MenuProps {
  readonly name: string;
  readonly children?: ReactNode;
  readonly onItem?: () => void;
}

function Menu({ name, children, onItem }: MenuProps) {
  const [open, setOpen] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  useOutsidePress(open, rootRef, close);
  return (
    <div ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {name}
      </button>
      {open ? (
        <div role="menu" aria-label={name}>
          <button type="button" role="menuitem" onClick={onItem}>
            {`${name} item`}
          </button>
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface PageProps {
  readonly onOutsideClick?: () => void;
  readonly onOutsidePointer?: () => void;
  readonly onItem?: () => void;
}

function Page({ onOutsideClick, onOutsidePointer, onItem }: PageProps) {
  return (
    <>
      <Menu name="Network" onItem={onItem} />
      <button type="button" onClick={onOutsideClick} onPointerDown={onOutsidePointer} onPointerUp={onOutsidePointer} onMouseUp={onOutsidePointer}>
        Outside
      </button>
      <input aria-label="Dispute ID" />
      <p>Plain text</p>
    </>
  );
}

function outside() {
  return screen.getByRole("button", { name: "Outside" });
}

function menuButton(name: string) {
  return screen.getByRole("button", { name });
}

describe("useOutsidePress", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a mouse press outside closes the menu and reaches nothing under it with its press, its release or its click", () => {
    const onOutsideClick = vi.fn();
    const onOutsidePointer = vi.fn();
    render(<Page onOutsideClick={onOutsideClick} onOutsidePointer={onOutsidePointer} />);
    expect(mouseClick(outside())).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onOutsidePointer).not.toHaveBeenCalled();
    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("a tap outside closes the menu, reaches nothing under it with its press or its click, and cancels its touchend", () => {
    const onOutsideClick = vi.fn();
    const onOutsidePointer = vi.fn();
    render(<Page onOutsideClick={onOutsideClick} onOutsidePointer={onOutsidePointer} />);
    expect(tap(outside()).touchEndCancelled).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onOutsidePointer).not.toHaveBeenCalled();
    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("the next press after the one that closed the menu acts as usual", () => {
    const onOutsideClick = vi.fn();
    render(<Page onOutsideClick={onOutsideClick} />);
    tap(outside());
    expect(tap(outside()).touchEndCancelled).toBe(false);
    expect(onOutsideClick).toHaveBeenCalledTimes(1);
    expect(mouseClick(outside())).toBe(true);
    expect(onOutsideClick).toHaveBeenCalledTimes(2);
  });

  it("a mouse press outside on a field closes the menu without focusing the field, and the next press focuses it", async () => {
    const user = userEvent.setup();
    render(<Page />);
    const field = screen.getByRole("textbox", { name: "Dispute ID" });
    await user.click(field);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(field).not.toHaveFocus();
    await user.click(field);
    expect(field).toHaveFocus();
  });

  it("a mouse press outside on plain text keeps its default, so a drag from it still selects the text", () => {
    render(<Page />);
    const text = screen.getByText("Plain text");
    fireEvent.pointerDown(text, MOUSE);
    expect(fireEvent.mouseDown(text, { button: 0, detail: 1 })).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a key pressed while the press outside is still held does not let that press's click through", () => {
    const onOutsideClick = vi.fn();
    render(<Page onOutsideClick={onOutsideClick} />);
    fireEvent.pointerDown(outside(), MOUSE);
    fireEvent.mouseDown(outside(), { button: 0, detail: 1 });
    fireEvent.keyDown(outside(), { key: "Shift", shiftKey: true });
    fireEvent.pointerUp(outside(), MOUSE);
    fireEvent.mouseUp(outside(), { button: 0, detail: 1, shiftKey: true });
    expect(fireEvent.click(outside(), { button: 0, detail: 1, shiftKey: true })).toBe(false);
    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("a middle or right press outside leaves the menu open and takes nothing from what lies under it, as the library's popovers do", () => {
    const onOutsidePointer = vi.fn();
    render(<Page onOutsidePointer={onOutsidePointer} />);
    fireEvent.pointerDown(outside(), { ...MOUSE, button: 1 });
    fireEvent.pointerUp(outside(), { ...MOUSE, button: 1 });
    expect(fireEvent(outside(), new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1, detail: 1 }))).toBe(true);
    fireEvent.pointerDown(outside(), { ...MOUSE, button: 2 });
    expect(fireEvent.contextMenu(outside(), { button: 2 })).toBe(true);
    fireEvent.pointerUp(outside(), { ...MOUSE, button: 2 });
    expect(screen.getByRole("menu", { name: "Network" })).toBeInTheDocument();
    expect(onOutsidePointer).toHaveBeenCalledTimes(4);
  });

  it("a touch that starts outside and turns into a scroll closes the menu and leaves the touches after it alone", () => {
    const onOutsideClick = vi.fn();
    render(<Page onOutsideClick={onOutsideClick} />);
    fireEvent.pointerDown(outside(), TOUCH);
    fireEvent.touchStart(outside());
    fireEvent.pointerCancel(outside(), TOUCH);
    fireEvent.touchMove(outside());
    expect(fireEvent.touchEnd(outside())).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
    // A click with no press of its own, such as a screen reader's.
    fireEvent.click(outside(), { detail: 0 });
    expect(onOutsideClick).toHaveBeenCalledTimes(1);
    tap(outside());
    expect(onOutsideClick).toHaveBeenCalledTimes(2);
  });

  it("a second finger that lands during the tap outside does not let the tap's click through", () => {
    const onOutsideClick = vi.fn();
    render(<Page onOutsideClick={onOutsideClick} />);
    fireEvent.pointerDown(outside(), TOUCH);
    fireEvent.pointerDown(outside(), { ...TOUCH, pointerId: 3, isPrimary: false });
    fireEvent.pointerUp(outside(), TOUCH);
    fireEvent.click(outside(), { button: 0, detail: 1 });
    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("a key press after a press outside that brought no click acts as usual", () => {
    const onOutsideClick = vi.fn();
    render(<Page onOutsideClick={onOutsideClick} />);
    // Released somewhere that gets no click.
    fireEvent.pointerDown(outside(), MOUSE);
    fireEvent.pointerUp(document.body, MOUSE);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.keyDown(outside(), { key: "Enter" });
    fireEvent.click(outside(), { detail: 0 });
    expect(onOutsideClick).toHaveBeenCalledTimes(1);
  });

  it("a press outside that brings no click stops guarding the page within a second", () => {
    vi.useFakeTimers();
    const onOutsideClick = vi.fn();
    render(<Page onOutsideClick={onOutsideClick} />);
    fireEvent.pointerDown(outside(), MOUSE);
    fireEvent.pointerUp(document.body, MOUSE);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(outside(), { detail: 0 });
    expect(onOutsideClick).toHaveBeenCalledTimes(1);
  });

  it("a press inside the menu acts and keeps the menu open", () => {
    const onItem = vi.fn();
    render(<Page onItem={onItem} />);
    expect(mouseClick(screen.getByRole("menuitem", { name: "Network item" }))).toBe(true);
    expect(tap(screen.getByRole("menuitem", { name: "Network item" })).touchEndCancelled).toBe(false);
    expect(onItem).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("menu", { name: "Network" })).toBeInTheDocument();
  });

  it("a press on the menu's own button closes it once, and the next press opens it again", () => {
    render(<Page />);
    mouseClick(menuButton("Network"));
    expect(menuButton("Network")).toHaveAttribute("aria-expanded", "false");
    mouseClick(menuButton("Network"));
    expect(menuButton("Network")).toHaveAttribute("aria-expanded", "true");
    tap(menuButton("Network"));
    expect(menuButton("Network")).toHaveAttribute("aria-expanded", "false");
  });

  it("with two menus open, a press on one menu's item closes the other menu only and acts on nothing", () => {
    const onDrawerItem = vi.fn();
    render(
      <>
        <Menu name="Drawer" onItem={onDrawerItem} />
        <Menu name="Network" />
      </>,
    );
    const drawerItem = screen.getByRole("menuitem", { name: "Drawer item" });
    tap(drawerItem);
    expect(screen.queryByRole("menu", { name: "Network" })).toBeNull();
    expect(screen.getByRole("menu", { name: "Drawer" })).toBeInTheDocument();
    expect(onDrawerItem).not.toHaveBeenCalled();
    tap(drawerItem);
    expect(onDrawerItem).toHaveBeenCalledTimes(1);
  });
});
