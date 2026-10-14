import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Notice } from "./Notice";
import type { NoticeVariant } from "./types";

const VARIANTS: readonly NoticeVariant[] = ["success", "warning", "error", "info"];

describe("Notice", () => {
  it.each(VARIANTS)("D-14: renders the %s variant without throwing", (variant) => {
    render(<Notice variant={variant} title="Title" body="Body" />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("D-14: the error path renders as an alert", () => {
    render(<Notice variant="error" title="Funding failed" body="The transaction was rejected." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Funding failed");
    expect(screen.getByRole("alert")).toHaveTextContent("The transaction was rejected.");
  });

  it("D-14: danger is not a variant", () => {
    // @ts-expect-error -- the closed set has no `danger` (D-14).
    const variant: NoticeVariant = "danger";
    expect(VARIANTS).not.toContain(variant);
  });

  it("spec 2.8: an empty title shows the capitalized variant", () => {
    render(<Notice variant="warning" title="" body="Body" />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("spec 5.10: preserves line breaks in the body", () => {
    render(<Notice variant="info" title="Question" body={"line one\nline two"} testId="case-reality-notice" />);
    const notice = screen.getByTestId("case-reality-notice");
    expect(notice).toHaveClass("whitespace-pre-line");
    expect(notice).toHaveTextContent("line one line two");
    expect(screen.getByText((_, element) => element?.tagName === "SMALL" && element.textContent === "line one\nline two")).toBeInTheDocument();
  });

  it("spec 5.10: renders markup in an untrusted title or body as text", () => {
    const { container } = render(<Notice variant="info" title="<b>t</b>" body="<img src=x onerror=alert(1)>" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});
