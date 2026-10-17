import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateSteps } from "./CreateSteps";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CreateSteps", () => {
  it("spec §4: the form step is current and the summary step is not reached yet", () => {
    render(<CreateSteps titles={["Form", "Summary"]} current={0} />);
    expect(screen.getByRole("listitem", { name: "Form" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("listitem", { name: "Summary" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("listitem", { name: "Summary" })).not.toHaveAttribute("aria-current");
  });

  it("spec §4: on the summary the form step is completed and the summary step is current", () => {
    render(<CreateSteps titles={["Form", "Summary"]} current={1} />);
    expect(screen.getByRole("listitem", { name: "Form" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("listitem", { name: "Form" })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("listitem", { name: "Summary" })).toHaveAttribute("aria-current", "step");
  });

  it("§11.2: renders both steps without a React warning and puts no non-standard attribute on the DOM", () => {
    const consoleError = vi.spyOn(console, "error");
    const { rerender, container } = render(<CreateSteps titles={["Form", "Summary"]} current={0} />);
    rerender(<CreateSteps titles={["Form", "Summary"]} current={1} />);
    expect(consoleError).not.toHaveBeenCalled();
    expect(container.querySelector("[active]")).toBeNull();
  });
});
