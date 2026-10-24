import { describe, expect, it } from "vitest";
import { filterFromParam, filterOption } from "./periodFilter";

describe("period filter options", () => {
  it("the Ongoing option draws a solid primary-text dot while every period keeps its own colour", () => {
    expect(filterOption("all").dot).toBe("var(--klerosUIComponentsPrimaryText)");
    expect(filterOption(0).dot).toBe("var(--klerosUIComponentsPrimaryBlue)");
    expect(filterOption(1).dot).toBe("var(--klerosUIComponentsSecondaryPurple)");
    expect(filterOption(2).dot).toBe("var(--klerosUIComponentsTint)");
    expect(filterOption(3).dot).toBe("var(--klerosUIComponentsWarning)");
  });

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
});
