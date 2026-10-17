import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MARKDOWN_CORPUS } from "../test/safe-content";
import type { LegacyRendering } from "../test/safe-content";
import { SafeMarkdown } from "./SafeMarkdown";

/** Today's renderer writes this for a refused link; SafeMarkdown renders the label without an anchor instead (A11). */
const LEGACY_REFUSED_HREF = "javascript:void(0)";

interface RecordedDifference {
  /** Why the entry renders differently from today's. */
  readonly reason: string;
  /** Exactly what SafeMarkdown renders instead. */
  readonly observed: LegacyRendering;
}

/**
 * remark-parse 5 linked bracketed text that no definition names to the current page (`href=""`), brackets dropped.
 * SafeMarkdown keeps that text but not the dead link (P-10), as it does for a refused URL (A11).
 */
const LEGACY_UNDEFINED_REFERENCE_HREF = "";

/**
 * The corpus entries whose rendering differs from today's, each with the exact rendering expected instead: the D-31
 * image rule and the two backslash cases where CommonMark differs from remark-parse 5 (D-42, P-10).
 */
const DIFFERENCES: Readonly<Record<string, RecordedDifference>> = {
  images: {
    reason: "D-31: images load only from absolute https URLs; any other image shows its alt text",
    observed: { text: "httpimagejs", links: [], images: [{ alt: "https image", src: "https://example.com/a.png" }] },
  },
  "entities-escapes": {
    reason: "CommonMark (P-10): `\\<` escapes the bracket, where remark-parse 5 kept the backslash",
    observed: { text: "&©#*notemphasis*<tag>", links: [], images: [] },
  },
  "line-break-backslash": {
    reason: "CommonMark (P-10): a backslash before a line ending is a hard break, where remark-parse 5 kept the backslash",
    observed: { text: "LineoneLinetwo", links: [], images: [] },
  },
};

/**
 * What the comparison with today's rendering observes: the text without whitespace (react-markdown 9 writes a newline
 * between block elements where React 17's static markup of react-markdown 4 wrote none), the links and the images.
 */
function observe(root: HTMLElement): LegacyRendering {
  return {
    text: root.textContent.replace(/\s+/g, ""),
    links: [...root.querySelectorAll("a")].map((a) => ({ text: a.textContent, href: a.getAttribute("href") })),
    images: [...root.querySelectorAll("img")].map((img) => ({ alt: img.getAttribute("alt"), src: img.getAttribute("src") })),
  };
}

/**
 * Today's rendering with the A11 and P-10 transformations applied: a refused link and a link of an undefined reference
 * keep their label but are no longer links.
 */
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

describe("SafeMarkdown on the 9.2 corpus", () => {
  it.each(MARKDOWN_CORPUS.map((entry) => [entry.id, entry] as const))("SC-02 9.2: %s renders exactly as today's react-markdown 4 unless recorded", (id, entry) => {
    expect(renderObservation(entry.source)).toEqual(DIFFERENCES[id]?.observed ?? legacyObservation(entry.legacy));
  });

  it("SC-02 9.2: every recorded difference names a corpus entry and differs from today's rendering", () => {
    for (const [id, difference] of Object.entries(DIFFERENCES)) {
      const entry = MARKDOWN_CORPUS.find((candidate) => candidate.id === id);
      expect(entry, id).toBeDefined();
      expect(difference.observed, id).not.toEqual(entry === undefined ? undefined : legacyObservation(entry.legacy));
    }
  });
});
