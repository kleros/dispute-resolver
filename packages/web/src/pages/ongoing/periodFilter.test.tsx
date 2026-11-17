import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PeriodBadge } from "../../ui";
import { PERIOD_FILTER_OPTIONS, filterFromParam } from "./periodFilter";

describe("period filter options", () => {
  it("reads each option's ID from the address and anything else as every open dispute", () => {
    expect(filterFromParam("evidence")).toBe(0);
    expect(filterFromParam("commit")).toBe(1);
    expect(filterFromParam("voting")).toBe(2);
    expect(filterFromParam("appeal")).toBe(3);
    expect(filterFromParam("all")).toBe("all");
    expect(filterFromParam(null)).toBe("all");
    expect(filterFromParam("Appeal")).toBe("all");
    expect(filterFromParam("4")).toBe("all");
  });

  it("dots Evidence green, Commit and Voting blue, Appeal red and Ongoing in the text colour", () => {
    expect(PERIOD_FILTER_OPTIONS.map(({ id, dot }) => [id, dot])).toEqual([
      ["evidence", "var(--klerosUIComponentsSuccess)"],
      ["commit", "var(--klerosUIComponentsPrimaryBlue)"],
      ["voting", "var(--klerosUIComponentsPrimaryBlue)"],
      ["appeal", "var(--klerosUIComponentsError)"],
      ["all", "var(--klerosUIComponentsPrimaryText)"],
    ]);
  });

  it("gives each period the same colour as its badge", () => {
    for (const option of PERIOD_FILTER_OPTIONS) {
      if (option.filter === "all") continue;
      const { container, unmount } = render(<PeriodBadge period={option.filter} />);
      const token = /^var\(--(klerosUIComponents\w+)\)$/.exec(option.dot)?.[1];
      expect(token, option.label).toBeDefined();
      expect(container.querySelector("[aria-hidden='true']"), option.label).toHaveClass(`bg-${token ?? ""}`);
      unmount();
    }
  });
});
