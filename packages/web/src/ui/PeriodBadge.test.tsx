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
  ] as const)("spec 3: period %i shows %s with its colored dot", (period, label, dotClass) => {
    const { container } = render(<PeriodBadge period={period} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    const dot = container.querySelector("[aria-hidden='true']");
    expect(dot).toHaveClass(dotClass);
  });

  it("B12: an out-of-range period from bad data renders a neutral badge", () => {
    render(<PeriodBadge period={7 as Period} />);
    expect(screen.getByText("Unknown period")).toBeInTheDocument();
  });
});
