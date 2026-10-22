import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MARKDOWN_CORPUS } from "../test/safe-content";
import type { LegacyRendering } from "../test/safe-content";
import { SafeMarkdown } from "./SafeMarkdown";

/** react-markdown 4 wrote this for a refused link; SafeMarkdown renders the label without an anchor instead. */
const LEGACY_REFUSED_HREF = "javascript:void(0)";

interface RecordedDifference {
  readonly reason: string;
  /** Exactly what SafeMarkdown renders instead. */
  readonly observed: LegacyRendering;
}

/**
 * remark-parse 5 linked bracketed text that no definition names to the current page (`href=""`), brackets dropped.
 * SafeMarkdown keeps that text but not the dead link, as it does for a refused URL.
 */
const LEGACY_UNDEFINED_REFERENCE_HREF = "";

/** The corpus entries whose rendering differs from react-markdown 4's, each with the exact rendering expected instead. */
const DIFFERENCES: Readonly<Record<string, RecordedDifference>> = {
  images: {
    reason: "images load only from absolute https URLs; any other image shows its alt text",
    observed: { text: "httpimagejs", links: [], images: [{ alt: "https image", src: "https://example.com/a.png" }] },
  },
  "entities-escapes": {
    reason: "CommonMark: `\\<` escapes the bracket, where remark-parse 5 kept the backslash",
    observed: { text: "&©#*notemphasis*<tag>", links: [], images: [] },
  },
  "line-break-backslash": {
    reason: "CommonMark: a backslash before a line ending is a hard break, where remark-parse 5 kept the backslash",
    observed: { text: "LineoneLinetwo", links: [], images: [] },
  },
};

/** Whitespace is dropped: react-markdown 9 writes a newline between block elements where react-markdown 4 wrote none. */
function observe(root: HTMLElement): LegacyRendering {
  return {
    text: root.textContent.replace(/\s+/g, ""),
    links: [...root.querySelectorAll("a")].map((a) => ({ text: a.textContent, href: a.getAttribute("href") })),
    images: [...root.querySelectorAll("img")].map((img) => ({ alt: img.getAttribute("alt"), src: img.getAttribute("src") })),
  };
}

function legacyObservation(legacy: LegacyRendering): LegacyRendering {
  const links = legacy.links.filter((link) => link.href !== LEGACY_REFUSED_HREF && link.href !== LEGACY_UNDEFINED_REFERENCE_HREF);
  return { text: legacy.text.replace(/\s+/g, ""), links, images: legacy.images };
}

function renderObservation(source: string): LegacyRendering {
  const { container } = render(<SafeMarkdown source={source} />);
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error("SafeMarkdown rendered no root element");
  return observe(root);
}

describe("SafeMarkdown on the markdown corpus", () => {
  it.each(MARKDOWN_CORPUS.map((entry) => [entry.id, entry] as const))("%s renders exactly as react-markdown 4 did unless a difference is recorded", (id, entry) => {
    expect(renderObservation(entry.source)).toEqual(DIFFERENCES[id]?.observed ?? legacyObservation(entry.legacy));
  });

  it("every recorded difference names a corpus entry and differs from the react-markdown 4 rendering", () => {
    for (const [id, difference] of Object.entries(DIFFERENCES)) {
      const entry = MARKDOWN_CORPUS.find((candidate) => candidate.id === id);
      expect(entry, id).toBeDefined();
      expect(difference.observed, id).not.toEqual(entry === undefined ? undefined : legacyObservation(entry.legacy));
    }
  });
});
