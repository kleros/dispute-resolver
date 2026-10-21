import { describe, expect, it } from "vitest";
import { filterOption } from "./periodFilter";

describe("period filter options", () => {
  it("the Ongoing option draws a solid primary-text dot while every period keeps its own colour", () => {
    expect(filterOption("all").dot).toBe("var(--klerosUIComponentsPrimaryText)");
    expect(filterOption(0).dot).toBe("var(--klerosUIComponentsPrimaryBlue)");
    expect(filterOption(1).dot).toBe("var(--klerosUIComponentsSecondaryPurple)");
    expect(filterOption(2).dot).toBe("var(--klerosUIComponentsTint)");
    expect(filterOption(3).dot).toBe("var(--klerosUIComponentsWarning)");
  });
});
