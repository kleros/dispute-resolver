import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectRenderErrors } from "../test/shell";
import { RootErrorBoundary } from "./RootErrorBoundary";

function Broken(): never {
  throw new Error("render failed");
}

const reload = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  expectRenderErrors();
  Object.defineProperty(window, "location", { configurable: true, value: { reload } });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  vi.restoreAllMocks();
  reload.mockReset();
});

describe("RootErrorBoundary", () => {
  it("a render error keeps a minimal frame instead of a blank page, whose footer names no chain and links no explorer", () => {
    render(
      <RootErrorBoundary>
        <Broken />
      </RootErrorBoundary>,
    );
    expect(within(screen.getByRole("banner")).getByRole("img", { name: "Kleros Dispute Resolver" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "I need help" })).toHaveAttribute("href", "https://t.me/kleros");
    expect(footer.queryByText("Unsupported Network")).not.toBeInTheDocument();
    expect(footer.queryByRole("link", { name: /explorer/ })).not.toBeInTheDocument();
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
});
