import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpandIndicator } from "./ExpandIndicator";

function verticalBar(container: HTMLElement): Element {
  const bar = container.querySelector('path[d="M8 2v12"]');
  if (bar === null) throw new Error("the indicator draws no vertical bar");
  return bar;
}

describe("ExpandIndicator", () => {
  it("draws a plus while collapsed and a minus while expanded", () => {
    const { container, rerender } = render(<ExpandIndicator expanded={false} />);
    expect(container.querySelector('path[d="M2 8h12"]')).not.toBeNull();
    expect(verticalBar(container)).toHaveClass("scale-y-100");
    expect(verticalBar(container)).not.toHaveClass("scale-y-0");

    rerender(<ExpandIndicator expanded />);
    expect(verticalBar(container)).toHaveClass("scale-y-0");
    expect(verticalBar(container)).not.toHaveClass("scale-y-100");
  });

  it("folds the vertical bar on the accordion's clock and snaps under reduced motion", () => {
    const { container } = render(<ExpandIndicator expanded={false} />);
    expect(verticalBar(container)).toHaveClass(
      "origin-center",
      "[transform-box:fill-box]",
      "transition-transform",
      "duration-(--acc-chevron)",
      "ease-(--acc-ease)",
      "motion-reduce:transition-none",
    );
  });

  it("is hidden from screen readers and drawn in the primary text colour", () => {
    const { container } = render(<ExpandIndicator expanded={false} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("size-4", "shrink-0", "stroke-klerosUIComponentsPrimaryText");
  });
});
