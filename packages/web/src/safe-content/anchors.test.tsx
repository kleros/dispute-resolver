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

/** What generated descriptions hold outside a construct: what makes a link, and what ends or nests one. */
const ATOMS = [
  "https://x",
  "https://y.io/p",
  "HTTPS://Z",
  "mailto:a@b.co",
  "mailto:",
  "@",
  "<https://a>",
  "<a@b.co>",
  "<mailto:c@d.co>",
  "[r]",
  "[^1]",
  "[a](https://b)",
  "![i](https://c)",
  "*",
  "~~",
  "[",
  "]",
  "(",
  ")",
  "<",
  "\\",
  "&amp;",
  "!",
  "|",
  ".",
  "x",
  " ",
] as const;

/** The constructs generated descriptions nest, as their opening and closing source. */
const CONSTRUCTS: readonly (readonly [open: string, close: string])[] = [
  ["*", "*"],
  ["**", "**"],
  ["_", "_"],
  ["~~", "~~"],
  ["`", "`"],
  ["(", ")"],
  ["[", "]"],
  ["[", "](https://b)"],
  ["[", "][r]"],
  ["[", "][]"],
  ["![", "](https://c)"],
  ["<", ">"],
  ["https://x(", ")"],
  ["https://x", ""],
  ["mailto:a@b.co", ""],
];

/** How a generated line starts: a paragraph, a quote, a list item, a heading or a table row. */
const LINE_STARTS = ["", "", "> ", "- ", "- [ ] ", "# ", "| "] as const;

/** Link definitions that the generated descriptions may end with, so that their references are links. */
const DEFINITIONS = ["", "\n\n[r]: https://r", "\n\n[a]: https://d\n[x]: <https://x>"] as const;

/** Descriptions that once rendered an anchor inside an anchor. */
const KNOWN_NESTINGS = [
  "https://x(*https://y*)",
  "~~https://x*https://y*~~",
  "https://x**a*https://y*b**",
  "mailto:a@b.co*https://y*",
  "https://x*mailto:a@b.co*",
  "https://x(*[a](b)*)",
  "https://x(*[a]*)\n\n[a]: https://z",
  "[<https://a>](https://b)",
  "[*<a@b.co>*](https://b)",
  "[<https://a>][r]\n\n[r]: https://b",
  "[<https://a>]\n\n[<https://a>]: https://b",
  "| [<https://a>](b) |\n|---|\n| https://x(*https://y*) |",
];

/** A deterministic generator of 32-bit values (a linear congruential generator), so a failure reproduces exactly. */
function generator(seed: number): (bound: number) => number {
  let state = seed;
  return (bound) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return (state >>> 8) % bound;
  };
}

function pick<T>(next: (bound: number) => number, values: readonly T[]): T {
  const value = values[next(values.length)];
  if (value === undefined) throw new Error("pick from an empty list");
  return value;
}

/** Inline content: atoms and constructs, nested up to `depth` levels. */
function inline(next: (bound: number) => number, depth: number): string {
  return Array.from({ length: 1 + next(3) }, () => {
    if (depth === 0 || next(3) === 0) return pick(next, ATOMS);
    const [open, close] = pick(next, CONSTRUCTS);
    return open + inline(next, depth - 1) + close;
  }).join("");
}

function generatedDescriptions(count: number): string[] {
  const next = generator(0x5eed);
  return Array.from({ length: count }, () => {
    const lines = Array.from({ length: 1 + next(3) }, () => pick(next, LINE_STARTS) + inline(next, 3));
    if (lines.length > 1 && next(2) === 0) lines.splice(1, 0, "| --- |");
    return lines.join(pick(next, ["\n", "\n\n"])) + pick(next, DEFINITIONS);
  });
}

/** The descriptions among `sources` whose rendering holds an anchor inside an anchor. */
function nestingAnchors(sources: readonly string[]): string[] {
  return sources.filter((source) => {
    const { container, unmount } = render(<SafeMarkdown source={source} />);
    const nested = container.querySelector("a a") !== null;
    unmount();
    return nested;
  });
}

describe("SafeMarkdown anchors", () => {
  it("§5.6: no corpus entry or known nesting renders an anchor inside an anchor", () => {
    expect(nestingAnchors([...MARKDOWN_CORPUS.map((entry) => entry.source), ...KNOWN_NESTINGS])).toEqual([]);
  });

  it("§5.6: no generated description renders an anchor inside an anchor", () => {
    expect(nestingAnchors(generatedDescriptions(2_000))).toEqual([]);
  });
});
