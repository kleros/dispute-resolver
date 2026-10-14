import type { AttachmentKind } from "@dispute-resolver/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Attachment } from "./Attachment";

const HREF = "https://cdn.kleros.link/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/photo.png";

describe("Attachment", () => {
  it("A10: links an attachment in a new tab with rel noopener noreferrer and its label", () => {
    render(<Attachment attachment={{ kind: "link", href: HREF, label: "photo.png", attachmentKind: "image" }} testId="evidence-attachment" />);
    const link = screen.getByRole("link", { name: "photo.png" });
    expect(link).toHaveAttribute("href", HREF);
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByTestId("evidence-attachment")).toBe(link);
  });

  it.each<AttachmentKind>(["image", "video", "text", "other"])("A17: never renders a %s attachment inline", (attachmentKind) => {
    const { container } = render(<Attachment attachment={{ kind: "link", href: HREF, label: "file", attachmentKind }} />);
    expect(container.querySelector("img, video, audio, iframe, object, embed")).toBeNull();
  });

  it("A17: chooses the icon from the attachment kind", () => {
    const icons = (["image", "video", "text", "other"] as const).map((attachmentKind) => {
      const { container, unmount } = render(<Attachment attachment={{ kind: "link", href: HREF, label: "file", attachmentKind }} />);
      const icon = container.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      const markup = icon?.outerHTML;
      unmount();
      return markup;
    });
    expect(new Set(icons).size).toBe(4);
  });

  it("D-32: shows a text attachment as plain text", () => {
    render(<Attachment attachment={{ kind: "text", text: "http://example.com/file.pdf" }} testId="link-meta-evidence-file" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByTestId("link-meta-evidence-file")).toHaveTextContent("http://example.com/file.pdf");
  });

  it("names a link whose URI has no last segment", () => {
    render(<Attachment attachment={{ kind: "link", href: "https://example.com/", label: "", attachmentKind: "other" }} />);
    expect(screen.getByRole("link", { name: "Attachment" })).toHaveAttribute("href", "https://example.com/");
  });

  it("renders nothing without an attachment", () => {
    const { container } = render(<Attachment attachment={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
