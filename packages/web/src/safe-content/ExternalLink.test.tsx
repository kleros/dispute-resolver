import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExternalLink } from "./ExternalLink";

describe("ExternalLink", () => {
  it("opens an https link in a new tab with rel noopener noreferrer", () => {
    render(<ExternalLink href="https://kleros.io">Kleros</ExternalLink>);
    const link = screen.getByRole("link", { name: "Kleros" });
    expect(link).toHaveAttribute("href", "https://kleros.io");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("links the trimmed URL", () => {
    render(<ExternalLink href="  https://kleros.io/a  ">Kleros</ExternalLink>);
    expect(screen.getByRole("link", { name: "Kleros" })).toHaveAttribute("href", "https://kleros.io/a");
  });

  const unsafeHrefs = ["http://example.com/file.pdf", "javascript:alert(1)", "data:text/html,<b>x</b>", "//evil.example/x", "https:/evil.example", "/relative", ""];
  it.each(unsafeHrefs)("shows %j as text, never as a link", (href) => {
    const { container } = render(<ExternalLink href={href}>label</ExternalLink>);
    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent("label");
  });

  it("shows the raw value when an unsafe link has no label", () => {
    const { container } = render(<ExternalLink href="http://example.com/x" />);
    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent("http://example.com/x");
  });

  it("uses the URL as the label when none is given", () => {
    render(<ExternalLink href="https://kleros.io/x" />);
    expect(screen.getByRole("link", { name: "https://kleros.io/x" })).toBeInTheDocument();
  });

  it("applies the caller's class instead of the default link style", () => {
    render(
      <ExternalLink href="https://kleros.io" className="custom">
        Kleros
      </ExternalLink>,
    );
    expect(screen.getByRole("link", { name: "Kleros" })).toHaveAttribute("class", "custom");
  });
});
