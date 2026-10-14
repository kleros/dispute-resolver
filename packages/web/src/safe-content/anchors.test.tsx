import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MARKDOWN_CORPUS } from "../test/safe-content";
import { Attachment, ExternalLink, SafeMarkdown } from ".";

describe("safe-content anchors", () => {
  it("A10: every anchor opens in a new tab with rel noopener noreferrer", () => {
    const { container } = render(
      <>
        <ExternalLink href="https://kleros.io">Kleros</ExternalLink>
        <ExternalLink href="http://example.com">Plain</ExternalLink>
        <Attachment
          attachment={{ kind: "link", href: "https://cdn.kleros.link/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/a.pdf", label: "a.pdf", attachmentKind: "other" }}
        />
        {MARKDOWN_CORPUS.map((entry) => (
          <SafeMarkdown key={entry.id} source={entry.source} />
        ))}
      </>,
    );
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors.length).toBeGreaterThan(10);
    for (const anchor of anchors) {
      expect(anchor).toHaveAttribute("target", "_blank");
      expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
      expect(anchor.getAttribute("href")).not.toMatch(/^\s*(javascript|data|vbscript):/i);
    }
  });
});
