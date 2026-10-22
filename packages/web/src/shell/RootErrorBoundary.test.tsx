import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RootErrorBoundary } from "./RootErrorBoundary";

function Broken(): never {
  throw new Error("render failed");
}

/** jsdom reports each error React rethrows in development; the report is expected here. */
function silenceErrorReport(event: ErrorEvent): void {
  event.preventDefault();
}

const reload = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  // React logs every caught render error; the log is expected here.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  window.addEventListener("error", silenceErrorReport);
  Object.defineProperty(window, "location", { configurable: true, value: { reload } });
});

afterEach(() => {
  window.removeEventListener("error", silenceErrorReport);
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  vi.restoreAllMocks();
  reload.mockReset();
});

describe("RootErrorBoundary", () => {
  it("renders its children while nothing throws", () => {
    render(
      <RootErrorBoundary>
        <p>App</p>
      </RootErrorBoundary>,
    );
    expect(screen.getByText("App")).toBeInTheDocument();
  });

  it("a render error keeps a minimal frame instead of a blank page", () => {
    render(
      <RootErrorBoundary>
        <Broken />
      </RootErrorBoundary>,
    );
    expect(within(screen.getByRole("banner")).getByRole("img", { name: "Kleros Dispute Resolver" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getByRole("link", { name: "I need help" })).toHaveAttribute("href", "https://t.me/kleros");
  });

  it("does not show the error's text, which may come from untrusted data", () => {
    render(
      <RootErrorBoundary>
        <Broken />
      </RootErrorBoundary>,
    );
    expect(screen.queryByText(/render failed/)).not.toBeInTheDocument();
  });

  it("the reload button reloads the page", async () => {
    const user = userEvent.setup();
    render(
      <RootErrorBoundary>
        <Broken />
      </RootErrorBoundary>,
    );
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("the footer of the minimal frame names no chain and links no explorer", () => {
    render(
      <RootErrorBoundary>
        <Broken />
      </RootErrorBoundary>,
    );
    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.queryByText("Unsupported Network")).not.toBeInTheDocument();
    expect(footer.queryByRole("link", { name: /explorer/ })).not.toBeInTheDocument();
  });
});
