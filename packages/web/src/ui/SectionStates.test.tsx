import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";
import { PageMessage } from "./PageMessage";
import { SectionSkeleton } from "./SectionSkeleton";
import type { SectionSkeletonProps } from "./types";

const FIRST_LINE = "animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_backwards]";
const NEXT_LINE = "animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_var(--stagger-stagger)_backwards]";

/** The placeholders under the skeleton's hidden content: its lines of text (`text`, `card`), its cards or its bars. */
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

  it("uses the library's loading animation on token-colored blocks", () => {
    const { container } = render(<SectionSkeleton variant="card" lines={1} />);
    const blocks = container.querySelectorAll(".animate-loading");
    expect(blocks.length).toBeGreaterThan(0);
    blocks.forEach((block) => {
      expect(block.className).toContain("bg-klerosUIComponentsStroke");
    });
  });

  it.each([0, -2, Number.NaN, 2.5])("never throws on a bad line count of %s", (lines) => {
    expect(() => render(<SectionSkeleton variant="grid" lines={lines} />)).not.toThrow();
  });
});

describe("EmptyState", () => {
  it("shows the title and body", () => {
    render(<EmptyState title="There are no open disputes." body="Check again later." />);
    expect(screen.getByText("There are no open disputes.")).toBeInTheDocument();
    expect(screen.getByText("Check again later.")).toBeInTheDocument();
  });

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

  it("raises the title first and the body, icon and action just after it, holding still under reduced motion", () => {
    render(<EmptyState title="There are no open disputes." body="Check again later." icon={<svg data-testid="mark" />} action={<button type="button">Look elsewhere</button>} />);
    expect(screen.getByText("There are no open disputes.")).toHaveClass(FIRST_LINE, "motion-reduce:animate-none");
    for (const later of [screen.getByText("Check again later."), screen.getByTestId("mark").parentElement, screen.getByRole("button", { name: "Look elsewhere" }).parentElement]) {
      expect(later).toHaveClass(NEXT_LINE, "motion-reduce:animate-none");
    }
  });
});

describe("PageMessage", () => {
  it("shows a page heading, a body and an action", () => {
    render(<PageMessage title="Search for a dispute" body="Enter a dispute ID to see its details." action={<button type="button">Go</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Search for a dispute" })).toBeInTheDocument();
    expect(screen.getByText("Enter a dispute ID to see its details.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  it("shows a title alone as a named region", () => {
    render(<PageMessage title="Dispute with ID 99 does not exist on this network." />);
    expect(screen.getByRole("region", { name: "Dispute with ID 99 does not exist on this network." })).toBeInTheDocument();
  });

  it("raises the heading first and the body and action just after it, holding still under reduced motion", () => {
    render(<PageMessage title="Search for a dispute" body="Enter a dispute ID to see its details." action={<button type="button">Go</button>} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(FIRST_LINE, "motion-reduce:animate-none");
    expect(screen.getByText("Enter a dispute ID to see its details.")).toHaveClass(NEXT_LINE, "motion-reduce:animate-none");
    expect(screen.getByRole("button", { name: "Go" }).parentElement).toHaveClass(NEXT_LINE, "motion-reduce:animate-none");
  });
});
