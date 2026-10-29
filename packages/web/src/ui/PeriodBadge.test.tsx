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

  it("the large badge takes the large stamp size", () => {
    render(<PeriodBadge period={0} size="lg" />);
    expect(screen.getByText("Evidence")).toHaveClass("h-9", "px-4", "text-base");
  });

  it("renders a neutral stamp for an out-of-range period", () => {
    const { container } = render(<PeriodBadge period={7 as Period} />);
    expect(screen.getByText("Unknown period")).toHaveClass("rounded-full", "border-klerosUIComponentsStroke");
    expect(container.querySelector("[aria-hidden='true']")).toHaveClass("bg-klerosUIComponentsSecondaryText");
  });
});
