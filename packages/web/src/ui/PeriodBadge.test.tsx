import type { Period } from "@dispute-resolver/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PeriodBadge } from "./PeriodBadge";

describe("PeriodBadge", () => {
  it.each([
    [0, "Evidence", "bg-klerosUIComponentsSuccess"],
    [1, "Commit", "bg-klerosUIComponentsPrimaryBlue"],
    [2, "Voting", "bg-klerosUIComponentsPrimaryBlue"],
    [3, "Appeal", "bg-klerosUIComponentsError"],
    [4, "Execution", "bg-klerosUIComponentsSecondaryText"],
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
