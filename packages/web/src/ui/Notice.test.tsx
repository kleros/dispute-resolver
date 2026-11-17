import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Notice } from "./Notice";

describe("Notice", () => {
  it("renders the error variant as an alert", () => {
    render(<Notice variant="error" title="Funding failed" body="The transaction was rejected." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Funding failed");
    expect(screen.getByRole("alert")).toHaveTextContent("The transaction was rejected.");
  });

  it("shows the capitalized variant for an empty title", () => {
    render(<Notice variant="warning" title="" body="Body" />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("preserves line breaks in the body", () => {
    const { container } = render(<Notice variant="info" title="Question" body={"line one\nline two"} />);
    const notice = container.firstElementChild;
    expect(notice).toHaveClass("whitespace-pre-line");
    expect(notice).toHaveTextContent("line one line two");
    expect(screen.getByText((_, element) => element?.tagName === "SMALL" && element.textContent === "line one\nline two")).toBeInTheDocument();
  });

  it("renders markup in an untrusted title or body as text", () => {
    const { container } = render(<Notice variant="info" title="<b>t</b>" body="<img src=x onerror=alert(1)>" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
  });

  it("raises the title and then the body into view when asked to reveal, and holds still under reduced motion", () => {
    const { container } = render(<Notice reveal variant="info" title="Title" body="Body" className="mt-2" />);
    const alert = container.firstElementChild?.firstElementChild;
    expect(alert).toHaveClass(
      "[&_h2]:animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_backwards]",
      "[&_small]:animate-[t-stagger-in_var(--stagger-dur)_var(--stagger-ease)_var(--stagger-stagger)_backwards]",
      "motion-reduce:[&_h2]:animate-none",
      "motion-reduce:[&_small]:animate-none",
      "mt-2",
    );
  });

  it("plays the check on a revealed success icon, scaled to the icon, and not under reduced motion", () => {
    const { container } = render(<Notice reveal variant="success" title="Transaction confirmed" body="Body" />);
    const alert = container.firstElementChild?.firstElementChild;
    expect(alert).toHaveClass(
      "[&_svg.fill-klerosUIComponentsSuccess]:animate-t-success-check",
      "[--check-y-amount:20px]",
      "motion-reduce:[&_svg.fill-klerosUIComponentsSuccess]:animate-none",
    );
    expect(container.querySelector("svg.fill-klerosUIComponentsSuccess")).not.toBeNull();
  });

  it("does not animate unless asked to reveal", () => {
    const { container } = render(<Notice variant="success" title="Title" body="Body" />);
    expect(container.innerHTML).not.toContain("animate-");
  });
});
