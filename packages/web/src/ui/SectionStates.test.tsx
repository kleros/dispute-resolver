import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";
import { PageMessage } from "./PageMessage";
import { SectionSkeleton } from "./SectionSkeleton";
import type { SectionSkeletonProps } from "./types";

function placeholders(container: HTMLElement, variant: SectionSkeletonProps["variant"]): readonly Element[] {
  if (variant === "text" || variant === "card") return [...container.querySelectorAll('[aria-hidden="true"] .animate-loading.h-4')];
  return [...(container.querySelector('[aria-hidden="true"] > div')?.children ?? [])];
}

describe("SectionSkeleton", () => {
  it("announces a busy loading state", () => {
    render(<SectionSkeleton variant="text" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Loading");
  });

  it.each([
    ["text", 3],
    ["card", 3],
    ["grid", 6],
    ["bars", 3],
  ] as const)("the %s variant renders %i placeholders by default", (variant, count) => {
    const { container } = render(<SectionSkeleton variant={variant} />);
    expect(placeholders(container, variant)).toHaveLength(count);
  });

  it("renders the requested number of lines", () => {
    const { container } = render(<SectionSkeleton variant="text" lines={5} />);
    expect(placeholders(container, "text")).toHaveLength(5);
  });

  it("the bars variant renders the requested number of accordion bars", () => {
    const { container } = render(<SectionSkeleton variant="bars" lines={4} />);
    expect(placeholders(container, "bars")).toHaveLength(4);
  });

  it.each([0, -2, Number.NaN, 2.5])("never throws on a bad line count of %s", (lines) => {
    expect(() => render(<SectionSkeleton variant="grid" lines={lines} />)).not.toThrow();
  });
});

describe("EmptyState", () => {
  it("renders without a body", () => {
    const { container } = render(<EmptyState title="No evidence submitted yet." />);
    expect(container).toHaveTextContent(/^No evidence submitted yet\.$/);
  });

  it("shows a decorative icon above the title and an action under the text", () => {
    const { container } = render(<EmptyState title="There are no open disputes." icon={<svg data-testid="mark" />} action={<button type="button">Look elsewhere</button>} />);
    expect(screen.getByTestId("mark").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Look elsewhere" })).toBeInTheDocument();
    expect(container).toHaveTextContent(/^There are no open disputes\.Look elsewhere$/);
  });
});

describe("PageMessage", () => {
  it("shows a title alone as a named region", () => {
    render(<PageMessage title="Dispute with ID 99 does not exist on this network." />);
    expect(screen.getByRole("region", { name: "Dispute with ID 99 does not exist on this network." })).toBeInTheDocument();
  });

  it("stands 64 px clear above and below on its own, and halves the space above when it answers a field", () => {
    const { rerender } = render(<PageMessage title="Find a dispute" />);
    expect(screen.getByRole("region")).toHaveClass("py-16");
    rerender(<PageMessage title="Find a dispute" compact />);
    expect(screen.getByRole("region")).toHaveClass("pt-8", "pb-16");
    expect(screen.getByRole("region")).not.toHaveClass("py-16");
  });
});
