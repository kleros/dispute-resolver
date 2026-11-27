import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../test/data";
import { expectRenderErrors } from "../test/shell";
import { SectionBoundary } from "./SectionBoundary";

type Held = ReturnType<typeof deferred<undefined>>;

let shouldThrow = true;

function retryButton(): HTMLElement {
  return screen.getByRole("button", { name: "Retry Summary" });
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
    expectRenderErrors();
  });

  afterEach(() => {
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

  it("without an onRetry handler, Retry resets the boundary and renders the section again", async () => {
    render(
      <SectionBoundary section="Summary">
        <Title title="Recovered title" />
      </SectionBoundary>,
    );
    shouldThrow = false;
    await userEvent.setup().click(retryButton());
    expect(screen.getByRole("heading", { name: "Recovered title" })).toBeInTheDocument();
    expect(screen.queryByText("Summary unavailable")).toBeNull();
  });

  it.each([
    [
      "resolves",
      (read: Held) => {
        read.resolve(undefined);
      },
    ],
    [
      "rejects",
      (read: Held) => {
        read.reject(new Error("socket hang up"));
      },
    ],
  ] as const)("with an onRetry handler, keeps the error with Retry busy until the re-read %s, and leaves the remount to its caller", async (_name, settle) => {
    const read = deferred<undefined>();
    render(
      <SectionBoundary section="Summary" onRetry={() => read.promise}>
        <Title title="Recovered title" />
      </SectionBoundary>,
    );
    shouldThrow = false;

    await userEvent.setup().click(retryButton());

    expect(screen.getByText("Summary unavailable")).toBeInTheDocument();
    expect(retryButton()).toHaveAttribute("aria-disabled", "true");
    expect(retryButton()).toHaveFocus();
    expect(retryButton().querySelector(".button-loading")).not.toBeNull();
    await act(async () => {
      settle(read);
      await read.promise.catch(() => undefined);
    });
    expect(screen.getByText("Summary unavailable")).toBeInTheDocument();
    expect(retryButton()).not.toHaveAttribute("aria-disabled");
    expect(retryButton().querySelector(".button-loading")).toBeNull();
  });
});
