import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installOfflineAppKitEnvironment } from "../../test/wallet";
import { CreateSteps } from "./CreateSteps";

const TITLES = ["Form", "Summary"];

/** Whether a console.error call is React's warning about the library forwarding its `active` prop to a div. */
function isKnownActiveWarning(call: readonly unknown[]): boolean {
  return call.map(String).join(" ").includes("non-boolean attribute") && call.includes("active");
}

beforeEach(() => {
  installOfflineAppKitEnvironment();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CreateSteps", () => {
  it("the form step is current and the summary step is not reached yet", () => {
    render(<CreateSteps titles={TITLES} current={0} />);
    expect(screen.getByRole("list", { name: "Horizontal progress steps" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Form" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("listitem", { name: "Summary" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("listitem", { name: "Summary" })).not.toHaveAttribute("aria-current");
  });

  it("on the summary the form step is completed and the summary step is current", () => {
    render(<CreateSteps titles={TITLES} current={1} />);
    const form = screen.getByRole("listitem", { name: "Form" });
    const summary = screen.getByRole("listitem", { name: "Summary" });
    expect(form).not.toHaveAttribute("aria-current");
    expect(form).not.toHaveAttribute("aria-disabled");
    expect(summary).toHaveAttribute("aria-current", "step");
    expect(form.querySelector("svg")).not.toBeNull();
    expect(form.querySelector("span")).toBeNull();
    expect(summary.querySelector("span")).toHaveTextContent("2");
  });

  it("logs nothing but the library's known active warning and writes no active attribute to the DOM", () => {
    const consoleError = vi.spyOn(console, "error");
    const { rerender, container } = render(<CreateSteps titles={TITLES} current={0} />);
    rerender(<CreateSteps titles={TITLES} current={1} />);
    expect(consoleError.mock.calls.filter((call) => !isKnownActiveWarning(call))).toEqual([]);
    expect(container.querySelector("[active]")).toBeNull();
  });

  it("pops the completed step's check in, with a rise scaled to the bullet and no animation under reduced motion", () => {
    render(<CreateSteps titles={TITLES} current={1} />);
    const classes = screen.getByRole("list", { name: "Horizontal progress steps" }).className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["[&_svg]:animate-t-success-check", "motion-reduce:[&_svg]:animate-none", "[--check-y-amount:20px]"]));
  });

  it("eases the bullets, the connecting lines and the titles to their new colours, and not at all under reduced motion", () => {
    render(<CreateSteps titles={TITLES} current={0} />);
    const classes = screen.getByRole("list", { name: "Horizontal progress steps" }).className.split(" ");
    for (const part of ["[&_[aria-hidden]>*]", "[&_[aria-hidden]_span]", "[&_li]:after", "[&_h2]"]) {
      expect(classes).toEqual(
        expect.arrayContaining([`${part}:transition-colors`, `${part}:duration-(--tabs-dur)`, `${part}:ease-(--tabs-ease)`, `motion-reduce:${part}:transition-none`]),
      );
    }
  });
});
