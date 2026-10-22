import { describe, expect, it } from "vitest";
import { remarkLegacyGfm } from "./legacyGfm";

/**
 * The mdast nodes these tests build, as CommonMark reads their source, with positions. The plugin is run on them
 * directly because rendering descriptions this large through the DOM takes far longer than the plugin itself.
 */
interface TreeNode {
  type: string;
  value?: string;
  url?: string;
  children?: TreeNode[];
  position?: { readonly start: { readonly offset: number }; readonly end: { readonly offset: number } };
}

/** Wide enough that passing one function argument per node or row exceeds the engine's call stack. */
const COUNT = 130_000;
const CODE_SPAN = "`a`";

function span(start: number, end: number): TreeNode["position"] {
  return { start: { offset: start }, end: { offset: end } };
}

function text(source: string, from: number, to: number): TreeNode {
  return { type: "text", value: source.slice(from, to), position: span(from, to) };
}

/** A one-paragraph document as CommonMark reads it: each `` `a` `` a code span, the source between them text. */
function documentOf(source: string): TreeNode {
  const children: TreeNode[] = [];
  let from = 0;
  for (let at = source.indexOf(CODE_SPAN); at !== -1; at = source.indexOf(CODE_SPAN, from)) {
    if (at > from) children.push(text(source, from, at));
    children.push({ type: "inlineCode", value: "a", position: span(at, at + CODE_SPAN.length) });
    from = at + CODE_SPAN.length;
  }
  if (from < source.length) children.push(text(source, from, source.length));
  return { type: "root", children: [{ type: "paragraph", children, position: span(0, source.length) }], position: span(0, source.length) };
}

function transform(source: string, tree: TreeNode): TreeNode | undefined {
  remarkLegacyGfm()(tree, { value: source });
  return tree.children?.[0];
}

describe("remarkLegacyGfm on large descriptions", () => {
  it("reads a table of 130,000 rows", () => {
    const source = "|a|\n|-|\n" + "|b|\n".repeat(COUNT);
    const table = transform(source, documentOf(source.slice(0, -1)));
    expect(table?.type).toBe("table");
    expect(table?.children).toHaveLength(COUNT + 1);
    expect(table?.children?.at(-1)?.children?.[0]?.children).toEqual([expect.objectContaining({ type: "text", value: "b" })]);
  });

  it("links a literal URL after 130,000 code spans", () => {
    const source = `${CODE_SPAN} `.repeat(COUNT) + "https://x";
    const children = transform(source, documentOf(source))?.children ?? [];
    expect(children).toHaveLength(2 * COUNT + 1);
    expect(children.at(-1)).toMatchObject({ type: "link", url: "https://x" });
  });

  it("links a literal URL before 130,000 code spans", () => {
    const source = ("https://x " + `${CODE_SPAN} `.repeat(COUNT)).trimEnd();
    const children = transform(source, documentOf(source))?.children ?? [];
    expect(children).toHaveLength(2 * COUNT + 1);
    expect(children[0]).toMatchObject({ type: "link", url: "https://x" });
  });
});
