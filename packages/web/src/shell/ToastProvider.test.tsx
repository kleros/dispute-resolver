import { Button, Modal } from "@kleros/ui-components-library";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { matchOnly } from "../test/matchMedia";
import { expectRenderErrors } from "../test/shell";
import { PHONE_MEDIA_QUERY } from "../ui";
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

function ToasterProbe({ onRender }: { readonly onRender: (toaster: Toaster) => void }) {
  onRender(useToast());
  return null;
}

/** Renders the provider around `children` and returns its toaster, for tests that drive it directly. */
function renderToaster(children?: ReactNode): () => Toaster {
  let latest: Toaster | undefined;
  render(
    <ToastProvider>
      {children}
      <ToasterProbe
        onRender={(toaster) => {
          latest = toaster;
        }}
      />
    </ToastProvider>,
  );
  return () => {
    if (latest === undefined) throw new Error("The toaster probe has not rendered.");
    return latest;
  };
}

function shown(toaster: () => Toaster, toast: ToastInput): number {
  let id = -1;
  act(() => {
    id = toaster().show(toast);
  });
  return id;
}

function outputs(): readonly HTMLElement[] {
  return [...screen.getByRole("region", { name: "Notifications" }).querySelectorAll<HTMLElement>(":scope > output")];
}

function toastTitled(title: string): HTMLElement {
  const toast = outputs().find((output) => output.querySelector("h2")?.textContent === title);
  if (toast === undefined) throw new Error(`No toast titled "${title}".`);
  return toast;
}

const SWITCH_LABEL = "Switch to Ethereum Mainnet";

function SwitchAction() {
  return <Button text={SWITCH_LABEL} variant="secondary" small onPress={() => undefined} />;
}

function Counter() {
  const [presses, setPresses] = useState(0);
  return (
    <Button
      text={`Pressed ${String(presses)} times`}
      variant="secondary"
      small
      onPress={() => {
        setPresses((count) => count + 1);
      }}
    />
  );
}

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
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

  it("show returns an id that update replaces in place, restarting the clock", () => {
    vi.useFakeTimers();
    const toaster = renderToaster();
    const id = shown(toaster, { variant: "sync", title: "Waiting for your wallet", autoHideMs: 1000 });
    expect(shown(toaster, { variant: "sync", title: "Another", autoHideMs: null })).not.toBe(id);
    const [toast] = outputs();
    advance(900);
    act(() => {
      toaster().update(id, { variant: "success", title: "Transaction confirmed", autoHideMs: 1000 });
    });
    expect(outputs()).toHaveLength(2);
    expect(outputs()[0]).toBe(toast);
    expect(toast).toHaveTextContent("Transaction confirmed");
    expect(region().queryByText("Waiting for your wallet")).toBeNull();
    advance(999);
    expect(toast).toHaveClass("is-open");
    advance(1);
    expect(toast).not.toHaveClass("is-open");
  });

  it("an update that lands while the toast closes keeps it open", () => {
    vi.useFakeTimers();
    const toaster = renderToaster();
    const id = shown(toaster, { variant: "sync", title: "Transaction submitted", autoHideMs: null });
    const [toast] = outputs();
    act(() => {
      toaster().dismiss(id);
    });
    expect(toast).not.toHaveClass("is-open");
    advance(CLOSE_MS - 100);
    act(() => {
      toaster().update(id, { variant: "success", title: "Transaction confirmed", autoHideMs: null });
    });
    advance(CLOSE_MS * 4);
    expect(outputs()).toEqual([toast]);
    expect(toast).toHaveClass("is-open");
    expect(toast).toHaveTextContent("Transaction confirmed");
    act(() => {
      toaster().dismiss(id);
    });
    advance(CLOSE_MS);
    expect(outputs()).toHaveLength(0);
  });

  it("an outcome that lands in the same tick as the close timer keeps the toast", () => {
    vi.useFakeTimers();
    const toaster = renderToaster();
    const id = shown(toaster, { variant: "sync", title: "Transaction submitted", autoHideMs: null });
    act(() => {
      toaster().dismiss(id);
    });
    advance(CLOSE_MS - 1);
    act(() => {
      toaster().update(id, { variant: "success", title: "Transaction confirmed", autoHideMs: null });
      vi.advanceTimersByTime(1);
    });
    advance(CLOSE_MS * 4);
    expect(toastTitled("Transaction confirmed")).toHaveClass("is-open");
    expect(outputs()).toHaveLength(1);
  });

  it("an update then a dismiss in one batch closes the toast", () => {
    vi.useFakeTimers();
    const toaster = renderToaster();
    const id = shown(toaster, { variant: "sync", title: "Wrong network", autoHideMs: null });
    act(() => {
      toaster().update(id, { variant: "sync", title: "Network switched", autoHideMs: null });
      toaster().dismiss(id);
    });
    expect(toastTitled("Network switched")).not.toHaveClass("is-open");
    advance(CLOSE_MS);
    expect(outputs()).toHaveLength(0);
  });

  it("an update after the toast was closed shows it again", () => {
    vi.useFakeTimers();
    const toaster = renderToaster();
    const id = shown(toaster, { variant: "sync", title: "Waiting for your wallet", autoHideMs: null });
    act(() => {
      toaster().dismiss(id);
    });
    advance(CLOSE_MS);
    expect(outputs()).toHaveLength(0);
    act(() => {
      toaster().update(id, { variant: "success", title: "Transaction confirmed", autoHideMs: null });
    });
    expect(toastTitled("Transaction confirmed")).toHaveClass("is-open");
  });

  it("dismiss closes the toast as its close button does", () => {
    vi.useFakeTimers();
    const toaster = renderToaster();
    const id = shown(toaster, { variant: "sync", title: "First", autoHideMs: null });
    shown(toaster, { variant: "sync", title: "Second", autoHideMs: null });
    act(() => {
      toaster().dismiss(id);
      toaster().dismiss(id + 100);
    });
    expect(toastTitled("First")).not.toHaveClass("is-open");
    expect(toastTitled("Second")).toHaveClass("is-open");
    advance(CLOSE_MS);
    expect(outputs().map((toast) => toast.querySelector("h2")?.textContent)).toEqual(["Second"]);
  });

  it("a toast without a clock stays until it is closed", () => {
    vi.useFakeTimers();
    const toaster = renderToaster();
    shown(toaster, { variant: "error", title: "Transaction failed", autoHideMs: null });
    advance(600_000);
    expect(toastTitled("Transaction failed")).toHaveClass("is-open");
  });

  it("an error toast keeps the library's surface and differs from a success by its icon, title and role", () => {
    const toaster = renderToaster();
    shown(toaster, { variant: "error", title: "Transaction failed", message: "The transaction reverted." });
    shown(toaster, { variant: "success", title: "Transaction confirmed", message: "Funded." });
    const error = region().getByRole("alert");
    const success = region().getByRole("status");
    const [errorMessage, successMessage] = [error.firstElementChild, success.firstElementChild];
    expect(errorMessage).toHaveClass("bg-klerosUIComponentsPrimaryBlue");
    expect(successMessage).toHaveClass("bg-klerosUIComponentsPrimaryBlue");
    expect(errorMessage?.className).toBe(successMessage?.className);
    expect(error.className).toBe(success.className);
    expect(document.body.querySelector("[class*='klerosUIComponentsError']")).toBeNull();
    expect(within(error).getByRole("heading", { name: "Transaction failed" })).toBeInTheDocument();
    expect(error.querySelector("svg")?.innerHTML).not.toBe(success.querySelector("svg")?.innerHTML);
  });

  it("the action button keeps the library's secondary face and label colours", () => {
    const toaster = renderToaster();
    shown(toaster, { variant: "error", title: "Wrong network", message: "Nothing was sent.", action: <SwitchAction /> });
    const button = region().getByRole("button", { name: SWITCH_LABEL });
    expect(button).toHaveClass("bg-klerosUIComponentsWhiteBackground", "border-klerosUIComponentsPrimaryBlue");
    expect(button.querySelector("p.button-text")).toHaveClass("text-klerosUIComponentsPrimaryBlue");
    const toast = toastTitled("Wrong network");
    for (const element of [toast, ...toast.querySelectorAll("*")]) {
      expect(element.getAttribute("class") ?? "").not.toMatch(/\[&_p\]|\[&_button\]/);
    }
  });

  it("the link opens through ExternalLink in a new tab and the action renders live under the message", async () => {
    const user = userEvent.setup();
    const toaster = renderToaster();
    shown(toaster, {
      variant: "success",
      title: "Transaction confirmed",
      message: "Funded “Red” with 336 xDai.",
      link: { href: "https://etherscan.io/tx/0x01", label: "View the transaction on the block explorer" },
      action: <Counter />,
    });
    const link = region().getByRole("link", { name: "View the transaction on the block explorer" });
    expect(link).toHaveAttribute("href", "https://etherscan.io/tx/0x01");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const toast = toastTitled("Transaction confirmed");
    const foot = toast.lastElementChild;
    expect(toast.firstElementChild).toHaveTextContent("Funded “Red” with 336 xDai.");
    expect(foot).toContainElement(link);
    await user.click(region().getByRole("button", { name: "Pressed 0 times" }));
    expect(region().getByRole("button", { name: "Pressed 1 times" })).toBeInTheDocument();
    expect(foot).toContainElement(region().getByRole("button", { name: "Pressed 1 times" }));
  });

  it("the close button keeps its Dismiss notification label when the toast carries a button of its own", () => {
    const toaster = renderToaster();
    const id = shown(toaster, { variant: "error", title: "Wrong network", action: <SwitchAction /> });
    expect(region().getAllByRole("button", { name: "Dismiss notification" })).toHaveLength(1);
    expect(region().getByRole("button", { name: SWITCH_LABEL })).not.toHaveAttribute("aria-label");
    act(() => {
      toaster().update(id, { variant: "sync", title: "Wallet required", action: <SwitchAction /> });
    });
    expect(region().getAllByRole("button", { name: "Dismiss notification" })).toHaveLength(1);
    expect(region().getByRole("button", { name: SWITCH_LABEL })).toBeInTheDocument();
  });

  it("an error toast is an alert unless it carries an action", () => {
    const toaster = renderToaster();
    shown(toaster, { variant: "error", title: "Transaction failed" });
    const id = shown(toaster, { variant: "error", title: "Wrong network", action: <SwitchAction /> });
    shown(toaster, { variant: "success", title: "Transaction confirmed" });
    expect(toastTitled("Transaction failed")).toHaveAttribute("role", "alert");
    const guard = toastTitled("Wrong network");
    expect(guard).not.toHaveAttribute("role");
    expect(toastTitled("Transaction confirmed")).not.toHaveAttribute("role");
    act(() => {
      toaster().update(id, { variant: "error", title: "Wrong network" });
    });
    expect(toastTitled("Wrong network")).toBe(guard);
    expect(guard).toHaveAttribute("role", "alert");
  });

  it("the region is rendered on the body and marked as a react-aria top layer", () => {
    const { container } = render(
      <ToastProvider>
        <p>Page</p>
      </ToastProvider>,
    );
    const notifications = screen.getByRole("region", { name: "Notifications" });
    expect(notifications.parentElement).toBe(document.body);
    expect(container).not.toContainElement(notifications);
    expect(notifications).toHaveAttribute("data-react-aria-top-layer", "true");
    expect(screen.getAllByRole("region", { name: "Notifications" })).toHaveLength(1);
  });

  it("on a phone only the three most recently changed toasts show; the others wait without a clock and return as shown ones close", () => {
    vi.useFakeTimers();
    window.matchMedia = matchOnly([PHONE_MEDIA_QUERY]);
    const toaster = renderToaster();
    const first = shown(toaster, { variant: "error", title: "First", autoHideMs: 1000 });
    shown(toaster, { variant: "sync", title: "Second", autoHideMs: null });
    shown(toaster, { variant: "sync", title: "Third", autoHideMs: null });
    expect(outputs().filter((toast) => toast.hidden)).toHaveLength(0);
    shown(toaster, { variant: "sync", title: "Fourth", autoHideMs: null });
    expect(toastTitled("First")).toHaveAttribute("hidden");
    expect(outputs().filter((toast) => toast.hidden)).toHaveLength(1);
    advance(5000);
    expect(toastTitled("First")).toHaveClass("is-open");
    act(() => {
      toaster().update(first, { variant: "error", title: "First again", autoHideMs: 1000 });
    });
    expect(toastTitled("First again")).not.toHaveAttribute("hidden");
    expect(toastTitled("Second")).toHaveAttribute("hidden");
    advance(999);
    expect(toastTitled("First again")).toHaveClass("is-open");
    advance(1);
    expect(toastTitled("First again")).not.toHaveClass("is-open");
    advance(CLOSE_MS);
    expect(outputs().map((toast) => [toast.querySelector("h2")?.textContent, toast.hidden])).toEqual([
      ["Second", false],
      ["Third", false],
      ["Fourth", false],
    ]);
  });

  it("a toast whose focused action is taken away by an update gets its clock back", () => {
    vi.useFakeTimers();
    const toaster = renderToaster();
    const id = shown(toaster, { variant: "error", title: "Wrong network", action: <SwitchAction />, autoHideMs: null });
    act(() => {
      region().getByRole("button", { name: SWITCH_LABEL }).focus();
    });
    act(() => {
      toaster().update(id, { variant: "sync", title: "Network switched", autoHideMs: 1000 });
    });
    advance(999);
    expect(toastTitled("Network switched")).toHaveClass("is-open");
    advance(1);
    expect(toastTitled("Network switched")).not.toHaveClass("is-open");
  });

  it("an update keeps the clock paused while focus stays inside the toast", () => {
    vi.useFakeTimers();
    const toaster = renderToaster();
    const id = shown(toaster, { variant: "error", title: "Wrong network", action: <SwitchAction />, autoHideMs: null });
    act(() => {
      region().getByRole("button", { name: "Dismiss notification" }).focus();
    });
    act(() => {
      toaster().update(id, { variant: "sync", title: "Network switched", autoHideMs: 1000 });
    });
    advance(5000);
    expect(toastTitled("Network switched")).toHaveClass("is-open");
  });

  it("a toast that returns from a phone's queue enters again instead of appearing at once", () => {
    vi.useFakeTimers();
    window.matchMedia = matchOnly([PHONE_MEDIA_QUERY]);
    const toaster = renderToaster();
    shown(toaster, { variant: "error", title: "First", autoHideMs: null });
    shown(toaster, { variant: "sync", title: "Second", autoHideMs: null });
    shown(toaster, { variant: "sync", title: "Third", autoHideMs: null });
    const fourth = shown(toaster, { variant: "sync", title: "Fourth", autoHideMs: null });
    const first = toastTitled("First");
    expect(first).toHaveAttribute("hidden");
    const watcher = new MutationObserver(() => undefined);
    watcher.observe(first, { attributes: true, attributeFilter: ["class", "hidden"], attributeOldValue: true });
    act(() => {
      toaster().dismiss(fourth);
    });
    advance(CLOSE_MS);
    const changes = watcher.takeRecords().map((record) => {
      if (record.attributeName === "hidden") return record.oldValue === null ? "hidden" : "shown";
      return record.oldValue?.includes("is-open") === true ? "closed" : "opened";
    });
    watcher.disconnect();
    expect(first).not.toHaveAttribute("hidden");
    expect(changes).toEqual(["shown", "closed", "opened"]);
    expect(first).toHaveClass("is-open");
  });

  it("a toast stays operable above the library's modal: not hidden from assistive technology, and its close button works by pointer with the modal open", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const toaster = renderToaster(
      <Modal isOpen isDismissable onOpenChange={onOpenChange} ariaLabel="Submit Evidence">
        <p>Evidence form</p>
      </Modal>,
    );
    shown(toaster, { variant: "error", title: "Transaction failed", autoHideMs: null });
    expect(screen.getByRole("dialog", { name: "Submit Evidence" })).toBeInTheDocument();
    const notifications = screen.getByRole("region", { name: "Notifications" });
    expect(notifications.closest("[aria-hidden='true']")).toBeNull();
    await user.click(within(notifications).getByRole("button", { name: "Dismiss notification" }));
    await waitFor(() => {
      expect(outputs()).toHaveLength(0);
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Submit Evidence" })).toBeInTheDocument();
  });
});
