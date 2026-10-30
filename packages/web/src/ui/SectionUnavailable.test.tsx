import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionUnavailable } from "./SectionUnavailable";

describe("SectionUnavailable", () => {
  it("offers no Retry without a handler", () => {
    render(<SectionUnavailable section="Timeline" error={{ code: "invalid-data", message: "Bad data." }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
