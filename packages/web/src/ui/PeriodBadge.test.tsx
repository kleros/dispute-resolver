import type { Period } from "@dispute-resolver/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PeriodBadge } from "./PeriodBadge";

describe("PeriodBadge", () => {
  it.each([
    [0, "Evidence", "bg-klerosUIComponentsPrimaryBlue"],
    [1, "Commit", "bg-klerosUIComponentsSecondaryPurple"],
    [2, "Voting", "bg-klerosUIComponentsTint"],
    [3, "Appeal", "bg-klerosUIComponentsWarning"],
    [4, "Execution", "bg-klerosUIComponentsSuccess"],
  ] as const)("period %i shows %s with its colored dot", (period, label, dotClass) => {
    const { container } = render(<PeriodBadge period={period} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    const dot = container.querySelector("[aria-hidden='true']");
    expect(dot).toHaveClass(dotClass);
  });

  it("renders a neutral badge for an out-of-range period", () => {
    render(<PeriodBadge period={7 as Period} />);
    expect(screen.getByText("Unknown period")).toBeInTheDocument();
  });

  it("the pill variant draws the stamp ring and fill around the same dot", () => {
    const { container } = render(<PeriodBadge period={3} variant="pill" />);
    const pill = screen.getByText("Appeal");
    expect(pill).toHaveClass("rounded-full", "border", "border-klerosUIComponentsStroke", "bg-klerosUIComponentsWhiteBackground", "h-7", "text-sm");
    expect(container.querySelector("[aria-hidden='true']")).toHaveClass("bg-klerosUIComponentsWarning");
  });

  it("the large pill takes the large stamp size", () => {
    render(<PeriodBadge period={0} variant="pill" size="lg" />);
    expect(screen.getByText("Evidence")).toHaveClass("h-9", "px-4", "text-base");
  });

  it.each([0, 1, 2, 3, 4] as const)("period %i has the same label text in both variants", (period) => {
    const dot = render(<PeriodBadge period={period} />).container.textContent;
    const pill = render(<PeriodBadge period={period} variant="pill" />).container.textContent;
    expect(pill).toBe(dot);
  });

  it("renders a neutral pill for an out-of-range period", () => {
    const { container } = render(<PeriodBadge period={7 as Period} variant="pill" />);
    expect(screen.getByText("Unknown period")).toHaveClass("rounded-full", "border-klerosUIComponentsStroke");
    expect(container.querySelector("[aria-hidden='true']")).toHaveClass("bg-klerosUIComponentsSecondaryText");
  });
});
