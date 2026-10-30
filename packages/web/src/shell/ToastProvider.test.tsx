import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectRenderErrors } from "../test/shell";
import { ToastProvider, useToast } from "./ToastProvider";
import type { ToastInput, Toaster } from "./types";

function Trigger({ toast }: { readonly toast: ToastInput }) {
  const toaster = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toaster.show(toast);
      }}
    >
      Show
    </button>
  );
}

function renderTrigger(toast: ToastInput) {
  render(
    <ToastProvider>
      <Trigger toast={toast} />
    </ToastProvider>,
  );
  return screen.getByRole("button", { name: "Show" });
}

function region() {
  return within(screen.getByRole("region", { name: "Notifications" }));
}

/** The fade-out after a dismissal, on the fallback clock: jsdom loads no stylesheet to read it from. */
const CLOSE_MS = 250;

/** jsdom's `document.hidden` is a read-only getter, so the test shadows it and announces the change as a browser would. */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function showNow(button: HTMLElement): void {
  act(() => {
    button.click();
  });
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

afterEach(() => {
  Reflect.deleteProperty(document, "hidden");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ToastProvider", () => {
  it("shows a toast with its title and message", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "success", title: "Dispute created", message: "Dispute #5 was created." }));
    expect(region().getByRole("status")).toHaveTextContent("Dispute created");
    expect(region().getByRole("status")).toHaveTextContent("Dispute #5 was created.");
  });

  it("the notification region is present before any toast, so screen readers announce additions", () => {
    renderTrigger({ variant: "success", title: "Done" });
    expect(screen.getByRole("region", { name: "Notifications" })).toHaveAttribute("aria-live", "polite");
  });

  it("starts fading a toast out after 5000 ms by default and removes it once the fade has run", () => {
    vi.useFakeTimers();
    showNow(renderTrigger({ variant: "success", title: "Dispute created" }));
    advance(4999);
    expect(region().getByRole("status")).toHaveClass("is-open");
    advance(1);
    expect(region().getByRole("status")).not.toHaveClass("is-open");
    advance(CLOSE_MS - 1);
    expect(region().getByText("Dispute created")).toBeInTheDocument();
    advance(1);
    expect(region().queryByText("Dispute created")).not.toBeInTheDocument();
  });

  it("a toast shown while the page is hidden waits, and gets its full delay once the page is shown again", () => {
    vi.useFakeTimers();
    setHidden(true);
    showNow(renderTrigger({ variant: "sync", title: "Wallet stayed", autoHideMs: 1000 }));
    advance(60_000);
    expect(region().getByRole("status")).toHaveClass("is-open");
    setHidden(false);
    advance(999);
    expect(region().getByRole("status")).toHaveClass("is-open");
    advance(1);
    expect(region().getByRole("status")).not.toHaveClass("is-open");
  });

  it.each([
    {
      name: "the pointer is over it",
      pause: (toast: HTMLElement) => fireEvent.pointerEnter(toast),
      resume: (toast: HTMLElement) => fireEvent.pointerLeave(toast),
    },
    {
      name: "its close button has focus",
      pause: () => {
        act(() => {
          region().getByRole("button", { name: "Dismiss notification" }).focus();
        });
      },
      resume: () => {
        act(() => {
          screen.getByRole("button", { name: "Show" }).focus();
        });
      },
    },
    {
      name: "the page is hidden",
      pause: () => {
        setHidden(true);
      },
      resume: () => {
        setHidden(false);
      },
    },
  ])("a toast stays while $name and gets its full delay once that ends", ({ pause, resume }) => {
    vi.useFakeTimers();
    showNow(renderTrigger({ variant: "error", title: "Not switched", message: "Body", autoHideMs: 1000 }));
    const toast = region().getByRole("alert");
    advance(900);
    pause(toast);
    advance(5000);
    expect(toast).toHaveClass("is-open");
    resume(toast);
    advance(999);
    expect(toast).toHaveClass("is-open");
    advance(1);
    expect(toast).not.toHaveClass("is-open");
  });

  it("stacks toasts and dismisses each on its own", async () => {
    const user = userEvent.setup();
    const show = renderTrigger({ variant: "success", title: "Toast", message: "Body" });
    await user.click(show);
    await user.click(show);
    expect(region().getAllByText("Toast")).toHaveLength(2);
    const [first] = region().getAllByRole("button", { name: "Dismiss notification" });
    if (first === undefined) throw new Error("No close button.");
    await user.click(first);
    await waitFor(() => {
      expect(region().getAllByText("Toast")).toHaveLength(1);
    });
  });

  it("renders markup in an untrusted title or message as text", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "success", title: "<img src=x onerror=alert(1)>", message: "<b>bold</b>" }));
    expect(region().getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(region().getByText("<b>bold</b>")).toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("useToast keeps the same toaster across renders", () => {
    const { result, rerender } = renderHook(() => useToast(), { wrapper: ToastProvider });
    const first: Toaster = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("useToast outside ToastProvider fails loudly", () => {
    expectRenderErrors();
    expect(() => renderHook(() => useToast())).toThrow("useToast is called outside ToastProvider.");
  });
});
