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
    const show = renderTrigger({ variant: "success", title: "Dispute created" });
    act(() => {
      show.click();
    });
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(region().getByRole("status")).toHaveClass("is-open");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region().getByRole("status")).not.toHaveClass("is-open");
    act(() => {
      vi.advanceTimersByTime(CLOSE_MS - 1);
    });
    expect(region().getByText("Dispute created")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region().queryByText("Dispute created")).not.toBeInTheDocument();
  });

  it("a toast shown while the page is hidden waits, and gets its full delay once the page is shown again", () => {
    vi.useFakeTimers();
    setHidden(true);
    const show = renderTrigger({ variant: "sync", title: "Wallet stayed", autoHideMs: 1000 });
    act(() => {
      show.click();
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(region().getByRole("status")).toHaveClass("is-open");
    setHidden(false);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(region().getByRole("status")).toHaveClass("is-open");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region().getByRole("status")).not.toHaveClass("is-open");
  });

  it("a toast hidden partway through its delay starts the full delay again when the page is shown", () => {
    vi.useFakeTimers();
    const show = renderTrigger({ variant: "sync", title: "Wallet stayed", autoHideMs: 1000 });
    act(() => {
      show.click();
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });
    setHidden(true);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    setHidden(false);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(region().getByRole("status")).toHaveClass("is-open");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region().getByRole("status")).not.toHaveClass("is-open");
  });

  it("a toast stays while the pointer is over it and gets its full delay once the pointer leaves", () => {
    vi.useFakeTimers();
    const show = renderTrigger({ variant: "error", title: "Not switched", message: "Body", autoHideMs: 1000 });
    act(() => {
      show.click();
    });
    const toast = region().getByRole("alert");
    fireEvent.pointerEnter(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(toast).toHaveClass("is-open");
    fireEvent.pointerLeave(toast);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(toast).toHaveClass("is-open");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(toast).not.toHaveClass("is-open");
  });

  it("a toast stays while its close button has focus and gets its full delay once focus leaves it", () => {
    vi.useFakeTimers();
    const show = renderTrigger({ variant: "error", title: "Not switched", message: "Body", autoHideMs: 1000 });
    act(() => {
      show.click();
    });
    const toast = region().getByRole("alert");
    act(() => {
      region().getByRole("button", { name: "Dismiss notification" }).focus();
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(toast).toHaveClass("is-open");
    act(() => {
      show.focus();
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(toast).toHaveClass("is-open");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(toast).not.toHaveClass("is-open");
  });

  it("gives the close button a 24 px target around the same glyph and keeps the text clear of it", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "error", title: "Not switched", message: "Body" }));
    expect(region().getByRole("alert")).toHaveClass(
      "[&_button]:size-6",
      "[&_button]:top-4",
      "[&_button]:right-4",
      "[&_button]:items-center",
      "[&_button]:justify-center",
      "[&>div>div]:pr-4",
    );
  });

  it("rises a toast in through the toast transition, opening it once it has mounted", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "success", title: "Dispute created" }));
    const toast = region().getByRole("status");
    expect(toast).toHaveClass("t-toast");
    expect(toast).toHaveClass("is-open");
    expect(toast.className).not.toMatch(/animate-/);
  });

  it("draws the focus ring on a toast in the toast's text colour, not the blue of its surface", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "success", title: "Dispute created" }));
    expect(region().getByRole("status")).toHaveClass("[--dr-focus:var(--klerosUIComponentsWhiteBackground)]");
  });

  it("the close button dismisses a toast and has an accessible name", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "success", title: "Dispute created", message: "Body" }));
    await user.click(region().getByRole("button", { name: "Dismiss notification" }));
    expect(region().getByRole("status")).not.toHaveClass("is-open");
    await waitFor(() => {
      expect(region().queryByText("Dispute created")).not.toBeInTheDocument();
    });
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

  it("an error toast is announced as an alert", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "error", title: "Creation failed", message: "The transaction reverted." }));
    expect(region().getByRole("alert")).toHaveTextContent("Creation failed");
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
