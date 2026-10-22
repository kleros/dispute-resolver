import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionBoundary } from "./SectionBoundary";

let shouldThrow = true;

/** jsdom reports each error React rethrows in development; the report is expected here. */
function silenceErrorReport(event: ErrorEvent): void {
  event.preventDefault();
}

/** Stands in for a section that renders a non-string meta-evidence title, which React rejects. */
function Title({ title }: { readonly title: unknown }) {
  if (shouldThrow) {
    throw new TypeError("Objects are not valid as a React child");
  }
  return <h2>{String(title)}</h2>;
}

describe("SectionBoundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs every caught render error; the log is expected here.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    window.addEventListener("error", silenceErrorReport);
  });

  afterEach(() => {
    window.removeEventListener("error", silenceErrorReport);
    vi.restoreAllMocks();
  });

  it("a render error replaces only its own section", () => {
    render(
      <main>
        <SectionBoundary section="Summary">
          <Title title={{ en: "object title" }} />
        </SectionBoundary>
        <SectionBoundary section="Timeline">
          <p>Timeline content</p>
        </SectionBoundary>
      </main>,
    );
    expect(screen.getByText("Summary unavailable")).toBeInTheDocument();
    expect(screen.getByText("Timeline content")).toBeInTheDocument();
  });

  it("shows the reason and no fake data", () => {
    render(
      <SectionBoundary section="Summary">
        <Title title={{}} />
      </SectionBoundary>,
    );
    expect(screen.getByText("The data for this section is malformed and cannot be displayed.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "[object Object]" })).toBeNull();
  });

  it("Retry resets the boundary and calls onRetry", async () => {
    const onRetry = vi.fn();
    render(
      <SectionBoundary section="Summary" onRetry={onRetry}>
        <Title title="Recovered title" />
      </SectionBoundary>,
    );
    shouldThrow = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry Summary" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Recovered title" })).toBeInTheDocument();
    expect(screen.queryByText("Summary unavailable")).toBeNull();
  });

  it("Retry works without an onRetry handler", async () => {
    render(
      <SectionBoundary section="Summary">
        <Title title="Recovered title" />
      </SectionBoundary>,
    );
    shouldThrow = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry Summary" }));
    expect(screen.getByRole("heading", { name: "Recovered title" })).toBeInTheDocument();
  });

  it("renders its children when nothing throws", () => {
    shouldThrow = false;
    render(
      <SectionBoundary section="Summary">
        <Title title="A title" />
      </SectionBoundary>,
    );
    expect(screen.getByRole("heading", { name: "A title" })).toBeInTheDocument();
  });
});
