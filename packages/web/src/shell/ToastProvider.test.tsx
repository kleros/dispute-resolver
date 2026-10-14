import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";
import type { ToastInput, Toaster, ToastVariant } from "./types";

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

/** jsdom reports each error React rethrows in development; the report is expected here. */
function silenceErrorReport(event: ErrorEvent): void {
  event.preventDefault();
}

afterEach(() => {
  window.removeEventListener("error", silenceErrorReport);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ToastProvider (spec §2.7)", () => {
  it("spec §2.7: shows a toast with its title and message", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "success", title: "Dispute created", message: "Dispute #5 was created." }));
    expect(region().getByRole("status")).toHaveTextContent("Dispute created");
    expect(region().getByRole("status")).toHaveTextContent("Dispute #5 was created.");
  });

  it("spec §2.7: the notification region is present before any toast, so screen readers announce additions", () => {
    renderTrigger({ variant: "success", title: "Done" });
    expect(screen.getByRole("region", { name: "Notifications" })).toHaveAttribute("aria-live", "polite");
  });

  it("spec §4.6: hides a toast after 5000 ms by default", () => {
    vi.useFakeTimers();
    const show = renderTrigger({ variant: "success", title: "Dispute created" });
    act(() => {
      show.click();
    });
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(region().getByText("Dispute created")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region().queryByText("Dispute created")).not.toBeInTheDocument();
  });

  it("spec §2.7: hides a toast after its own delay", () => {
    vi.useFakeTimers();
    const show = renderTrigger({ variant: "sync", title: "Waiting", autoHideMs: 1000 });
    act(() => {
      show.click();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(region().queryByText("Waiting")).not.toBeInTheDocument();
  });

  it("spec §2.7: the close button dismisses a toast and has an accessible name", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "success", title: "Dispute created", message: "Body" }));
    await user.click(region().getByRole("button", { name: "Dismiss notification" }));
    expect(region().queryByText("Dispute created")).not.toBeInTheDocument();
  });

  it("spec §2.7: stacks toasts and dismisses each on its own", async () => {
    const user = userEvent.setup();
    const show = renderTrigger({ variant: "success", title: "Toast", message: "Body" });
    await user.click(show);
    await user.click(show);
    expect(region().getAllByText("Toast")).toHaveLength(2);
    const [first] = region().getAllByRole("button", { name: "Dismiss notification" });
    if (first === undefined) throw new Error("No close button.");
    await user.click(first);
    expect(region().getAllByText("Toast")).toHaveLength(1);
  });

  it.each<ToastVariant>(["success", "error", "sync"])("D-14: renders the %s variant without throwing", async (variant) => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant, title: `A ${variant} toast`, message: "Body" }));
    expect(region().getByText(`A ${variant} toast`)).toBeInTheDocument();
  });

  it("D-14: an error toast is announced as an alert", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "error", title: "Creation failed", message: "The transaction reverted." }));
    expect(region().getByRole("alert")).toHaveTextContent("Creation failed");
  });

  it("spec §2.7: renders markup in an untrusted title or message as text", async () => {
    const user = userEvent.setup();
    await user.click(renderTrigger({ variant: "success", title: "<img src=x onerror=alert(1)>", message: "<b>bold</b>" }));
    expect(region().getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(region().getByText("<b>bold</b>")).toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("spec §2.7: useToast keeps the same toaster across renders", () => {
    const { result, rerender } = renderHook(() => useToast(), { wrapper: ToastProvider });
    const first: Toaster = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("spec §2.7: useToast outside ToastProvider fails loudly", () => {
    // React logs the error the hook throws; the log is expected here.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.addEventListener("error", silenceErrorReport);
    expect(() => renderHook(() => useToast())).toThrow("useToast is called outside ToastProvider.");
  });
});
