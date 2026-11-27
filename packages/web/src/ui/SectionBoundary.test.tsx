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

  it.each([
    { name: "calls the onRetry handler", handler: true },
    { name: "needs no onRetry handler", handler: false },
  ])("Retry resets the boundary, renders the section again and $name", async ({ handler }) => {
    const onRetry = vi.fn(() => Promise.resolve());
    render(
      <SectionBoundary section="Summary" onRetry={handler ? onRetry : undefined}>
        <Title title="Recovered title" />
      </SectionBoundary>,
    );
    shouldThrow = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry Summary" }));
    expect(onRetry).toHaveBeenCalledTimes(handler ? 1 : 0);
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
  ] as const)("keeps the error with Retry busy until the re-read settles, and renders the section again once it %s", async (_name, settle) => {
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
    expect(screen.getByRole("heading", { name: "Recovered title" })).toBeInTheDocument();
    expect(screen.queryByText("Summary unavailable")).toBeNull();
  });

  it("a re-read that leaves the section broken shows the error again with an idle Retry", async () => {
    const read = deferred<undefined>();
    render(
      <SectionBoundary section="Summary" onRetry={() => read.promise}>
        <Title title="Still broken" />
      </SectionBoundary>,
    );
    await userEvent.setup().click(retryButton());
    expect(retryButton()).toHaveAttribute("aria-disabled", "true");

    await act(async () => {
      read.resolve(undefined);
      await read.promise;
    });

    expect(screen.getByText("Summary unavailable")).toBeInTheDocument();
    expect(retryButton()).not.toHaveAttribute("aria-disabled");
  });
});
