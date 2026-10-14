/**
 * Today's GitHub-flavored syntax for `SafeMarkdown` (ARCHITECTURE.md 9.2, spec §5.6). Today's react-markdown 4 parses
 * with remark-parse 5 in its default `gfm` mode; react-markdown 9 parses CommonMark only. This remark plugin rewrites
 * the CommonMark tree with remark-parse 5's own rules, which remark-gfm does not share (it links `www.` and bare e-mail
 * addresses, keeps a balanced `)` in a URL and strikes through `~single~` tildes):
 * - a literal `http://`, `https://` or `mailto:` URL becomes a link; a scheme in capitals only where an inline run
 *   starts, because remark-parse 5 looked for the lowercase schemes; `mailto:` is dropped from the label;
 * - `~~text~~` becomes strikethrough;
 * - a paragraph whose first two lines are a pipe row and an alignment row becomes a table;
 * - a list item that starts with `[ ]` or `[x]` becomes a task item;
 * - an angle autolink to `mailto:` is labelled without the scheme;
 * - bracketed text that CommonMark left as text because no definition names it loses its brackets, as remark-parse 5's
 *   reference did, but is not a link: today's link to the current page led nowhere (P-10). Footnote markers and their
 *   definitions (`[^1]`, `[^1]: text`) and a bare task marker (`- [x]`) are such text.
 * A character written as a backslash escape or a character reference is never syntax. Links made here still pass
 * through `urlTransform`, so the A11 allowlist applies to them.
 */

interface MarkdownPoint {
  readonly offset?: number;
}

/** The parts of an mdast node this plugin reads or writes. */
interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  checked?: boolean | null;
  align?: TableAlign[];
  children?: MarkdownNode[];
  position?: { readonly start: MarkdownPoint; readonly end: MarkdownPoint };
}

type TableAlign = "left" | "right" | "center" | null;

interface Context {
  readonly source: string;
  /** Per text node, which characters came from a backslash escape or a character reference. */
  readonly escaped: WeakMap<MarkdownNode, readonly boolean[]>;
}

const WHITESPACE = /\s/;
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const CHARACTER_REFERENCE = /^&(?:#\d{1,7}|#[Xx][\dA-Fa-f]{1,6}|[A-Za-z][\dA-Za-z]{1,31});/;
const TASK_MARKER = /^\[([\t xX])\][\t ]/;
const URL_PROTOCOLS = ["http://", "https://", "mailto:"] as const;
const MAILTO = "mailto:";
/** Characters remark-parse 5 left out of a literal URL when they end the text or precede whitespace. */
const URL_TRAILING = new Set([".", ",", ":", ";", '"', "'", ")", "]"]);
/** Inline nodes a literal URL never runs into. */
const URL_STOPS = new Set(["link", "linkReference", "image", "imageReference", "html", "break"]);
/** Inline nodes that CommonMark made from brackets; a bracket never pairs with one across them. */
const BRACKET_NODES = new Set(["link", "linkReference", "image", "imageReference"]);
const LINE_PREFIX = new Set([" ", "\t", ">"]);
/** Stands in for an inline node whose source is unknown (one this plugin made). */
const UNKNOWN_SOURCE = "\uFFFC";

function isWhitespace(character: string): boolean {
  return character !== "" && WHITESPACE.test(character);
}

function rawSource(node: MarkdownNode, context: Context): string | undefined {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? undefined : context.source.slice(start, end);
}

// --- Escaped characters ---------------------------------------------------------------------------------------------

/** Where the source continues after a line ending of a text value: past trailing blanks and the next line's prefix. */
function skipLineEnding(source: string, from: number, next: string): number | undefined {
  let index = from;
  while (source.charAt(index) === " " || source.charAt(index) === "\t") index++;
  if (source.charAt(index) !== "\n") return undefined;
  index++;
  while (LINE_PREFIX.has(source.charAt(index)) && source.charAt(index) !== next) index++;
  return index;
}

/** How many characters of `value` a character reference decoded to, judged by where the source resumes. */
function referenceLength(value: string, at: number, source: string, resume: number): number | undefined {
  for (const length of [1, 2]) {
    const following = value.charAt(at + length);
    if (following === "" || following === "\n" || following === source.charAt(resume) || source.charAt(resume) === "\\" || source.charAt(resume) === "&") {
      return length;
    }
  }
  return undefined;
}

interface AlignedCharacters {
  /** How many characters of the value this step covers, and whether they were escaped. */
  readonly count: number;
  readonly escaped: boolean;
  /** Where the source continues. */
  readonly next: number;
}

/** Matches the source at `at` to the value's characters at `index`: a line ending, an escape, a reference or itself. */
function alignCharacter(value: string, index: number, source: string, at: number): AlignedCharacters | undefined {
  const character = value.charAt(index);
  if (character === "\n") {
    const next = skipLineEnding(source, at, value.charAt(index + 1));
    return next === undefined ? undefined : { count: 1, escaped: false, next };
  }
  if (source.charAt(at) === "\\" && ASCII_PUNCTUATION.test(character) && source.charAt(at + 1) === character) {
    return { count: 1, escaped: true, next: at + 2 };
  }
  const reference = source.charAt(at) === "&" ? CHARACTER_REFERENCE.exec(source.slice(at, at + 40)) : null;
  const decoded = reference === null ? undefined : referenceLength(value, index, source, at + reference[0].length);
  if (reference !== null && decoded !== undefined) return { count: decoded, escaped: true, next: at + reference[0].length };
  return source.charAt(at) === character ? { count: 1, escaped: false, next: at + 1 } : undefined;
}

/** Aligns a text value with its source and marks each character that was escaped; `undefined` when they do not align. */
function alignEscapes(value: string, source: string, start: number): boolean[] | undefined {
  const escaped: boolean[] = [];
  let at = start;
  while (escaped.length < value.length) {
    const step = alignCharacter(value, escaped.length, source, at);
    if (step === undefined) return undefined;
    for (let count = 0; count < step.count; count++) escaped.push(step.escaped);
    at = step.next;
  }
  return escaped;
}

/** Which characters of a text node are escaped. A node that cannot be aligned with its source counts as all escaped. */
function escapesOf(node: MarkdownNode, context: Context): readonly boolean[] {
  const known = context.escaped.get(node);
  if (known !== undefined) return known;
  const value = node.value ?? "";
  const raw = rawSource(node, context);
  const start = node.position?.start.offset;
  let escaped: readonly boolean[];
  if (raw === value) escaped = new Array<boolean>(value.length).fill(false);
  else escaped = (start === undefined ? undefined : alignEscapes(value, context.source, start)) ?? new Array<boolean>(value.length).fill(true);
  context.escaped.set(node, escaped);
  return escaped;
}

function textNode(value: string, escaped: readonly boolean[], context: Context): MarkdownNode {
  const node: MarkdownNode = { type: "text", value };
  context.escaped.set(node, escaped);
  return node;
}

/** The characters `from` to `to` of a text node, as a new text node. */
function sliceText(node: MarkdownNode, from: number, to: number, context: Context): MarkdownNode {
  return textNode((node.value ?? "").slice(from, to), escapesOf(node, context).slice(from, to), context);
}

// --- Inline runs ----------------------------------------------------------------------------------------------------

type SegmentKind = "text" | "inline" | "stop";

interface Segment {
  readonly node: MarkdownNode;
  readonly start: number;
  readonly end: number;
  readonly kind: SegmentKind;
}

/**
 * A parent's inline children as one string (text values, other nodes as their markdown source) with per-character
 * tables computed once, so scanning stays linear in the length of the content.
 */
interface Run {
  readonly text: string;
  readonly segments: readonly Segment[];
  /** Per character, the index of its segment. */
  readonly segmentOf: readonly number[];
  /** Per character, whether it is a literal character of a text node, which alone can be syntax. */
  readonly literal: readonly boolean[];
  /** Per character, the next index that ends any literal URL: whitespace, `<` or a node a URL never runs into. */
  readonly nextBreak: readonly number[];
  /** Per character, the index of the next `@`. */
  readonly nextAt: readonly number[];
  /** The ascending indexes of each `~~` that can close a strikethrough: literal and not preceded by whitespace. */
  readonly closers: readonly number[];
  /** Per literal `[`, the index of the literal `]` that closes it (brackets nest), or -1 when none does. */
  readonly bracketClose: readonly number[];
  /** Per character, the index of the next literal `[`. */
  readonly nextOpen: readonly number[];
}

interface Construct {
  readonly nodes: readonly MarkdownNode[];
  readonly end: number;
}

function segmentKind(node: MarkdownNode): SegmentKind {
  if (node.type === "text") return "text";
  return URL_STOPS.has(node.type) ? "stop" : "inline";
}

/** A node's characters in a run: a text node's value, another node's source. */
function segmentCharacters(node: MarkdownNode, kind: SegmentKind, context: Context): string {
  if (kind === "text") return node.value ?? "";
  const raw = rawSource(node, context);
  return raw === undefined || raw === "" ? UNKNOWN_SOURCE : raw;
}

function buildSegments(children: readonly MarkdownNode[], context: Context): { text: string; segments: Segment[] } {
  const segments: Segment[] = [];
  let text = "";
  for (const node of children) {
    const kind = segmentKind(node);
    const characters = segmentCharacters(node, kind, context);
    segments.push({ node, start: text.length, end: text.length + characters.length, kind });
    text += characters;
  }
  return { text, segments };
}

function buildRun(children: readonly MarkdownNode[], context: Context): Run {
  const { text, segments } = buildSegments(children, context);
  const segmentOf: number[] = [];
  const literal: boolean[] = [];
  segments.forEach((segment, position) => {
    const escaped = segment.kind === "text" ? escapesOf(segment.node, context) : [];
    for (let index = segment.start; index < segment.end; index++) {
      segmentOf.push(position);
      literal.push(segment.kind === "text" && escaped[index - segment.start] === false);
    }
  });
  const nextBreak: number[] = new Array<number>(text.length + 1).fill(text.length);
  const nextAt: number[] = new Array<number>(text.length + 1).fill(text.length);
  for (let index = text.length - 1; index >= 0; index--) {
    const character = text.charAt(index);
    const stops = isWhitespace(character) || character === "<" || segments[segmentOf[index] ?? 0]?.kind === "stop";
    nextBreak[index] = stops ? index : (nextBreak[index + 1] ?? text.length);
    nextAt[index] = character === "@" ? index : (nextAt[index + 1] ?? text.length);
  }
  const closers: number[] = [];
  for (let index = 1; index + 1 < text.length; index++) {
    if (isTildes(text, literal, index) && !isWhitespace(text.charAt(index - 1))) closers.push(index);
  }
  return { text, segments, segmentOf, literal, nextBreak, nextAt, closers, ...pairBrackets(text, segments, segmentOf, literal) };
}

/** Pairs the literal brackets of a run in one pass; a node made from brackets (a link, an image) separates pairs. */
function pairBrackets(text: string, segments: readonly Segment[], segmentOf: readonly number[], literal: readonly boolean[]) {
  const bracketClose: number[] = new Array<number>(text.length).fill(-1);
  const nextOpen: number[] = new Array<number>(text.length + 1).fill(text.length);
  let open: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    if (BRACKET_NODES.has(segments[segmentOf[index] ?? 0]?.node.type ?? "")) open = [];
    else if (literal[index] === true && character === "[") open.push(index);
    else if (literal[index] === true && character === "]") {
      const opener = open.pop();
      if (opener !== undefined) bracketClose[opener] = index;
    }
  }
  for (let index = text.length - 1; index >= 0; index--) {
    nextOpen[index] = literal[index] === true && text.charAt(index) === "[" ? index : (nextOpen[index + 1] ?? text.length);
  }
  return { bracketClose, nextOpen };
}

function isLiteralCharacter(run: Run, index: number, character: string): boolean {
  return run.literal[index] === true && run.text.charAt(index) === character;
}

function isTildes(text: string, literal: readonly boolean[], index: number): boolean {
  return text.startsWith("~~", index) && literal[index] === true && literal[index + 1] === true;
}

function segmentAt(run: Run, index: number): Segment | undefined {
  const position = run.segmentOf[index];
  return position === undefined ? undefined : run.segments[position];
}

/** The nodes covering `from` to `to` of a run; text nodes are cut, other nodes are never split by the callers. */
function nodesIn(run: Run, from: number, to: number, context: Context): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  for (let position = run.segmentOf[from] ?? run.segments.length; position < run.segments.length; position++) {
    const segment = run.segments[position];
    if (segment === undefined || segment.start >= to) break;
    if (segment.kind === "text") {
      const piece = sliceText(segment.node, Math.max(from, segment.start) - segment.start, Math.min(to, segment.end) - segment.start, context);
      if (piece.value !== "") nodes.push(piece);
    } else {
      nodes.push(segment.node);
    }
  }
  return nodes;
}

/**
 * remark-parse 5's literal URL: from the scheme to whitespace, `<`, an unbalanced `)` or `]`, or punctuation that ends
 * the text or precedes whitespace. A URL that would end inside an inline node (emphasis, code) ends before it.
 */
function urlEnd(run: Run, from: number): number {
  const limit = run.nextBreak[from] ?? run.text.length;
  let index = from;
  let depth = 0;
  while (index < limit) {
    const character = run.text.charAt(index);
    const next = run.text.charAt(index + 1);
    if (URL_TRAILING.has(character) && (next === "" || isWhitespace(next))) break;
    if (character === "(" || character === "[") depth++;
    if (character === ")" || character === "]") depth--;
    if (depth < 0) break;
    index++;
  }
  const straddled = segmentAt(run, index);
  return straddled !== undefined && straddled.kind !== "text" && straddled.start < index ? straddled.start : index;
}

function matchUrl(run: Run, index: number, runStart: boolean, context: Context): Construct | undefined {
  const segment = segmentAt(run, index);
  if (segment === undefined) return undefined;
  const head = run.text.slice(index, index + 8);
  const protocol = URL_PROTOCOLS.find((candidate) => (runStart ? head.toLowerCase() : head).startsWith(candidate));
  if (protocol === undefined || segment.end < index + protocol.length) return undefined;
  const start = index + protocol.length;
  const isMail = protocol === MAILTO;
  if (isMail && (run.nextAt[start] ?? run.text.length) >= (run.nextBreak[start] ?? run.text.length)) return undefined;
  const end = urlEnd(run, start);
  if (end === start || (isMail && !run.text.slice(start, end).includes("@"))) return undefined;
  const label = nodesIn(run, isMail ? start : index, end, context);
  const node: MarkdownNode = { type: "link", url: run.text.slice(index, end), children: scan(label, context, false) };
  return { nodes: [node], end };
}

/** The first index in an ascending list that is at least `minimum`. */
function firstFrom(sorted: readonly number[], minimum: number): number | undefined {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((sorted[middle] ?? minimum) < minimum) low = middle + 1;
    else high = middle;
  }
  return sorted[low];
}

/** remark-parse 5's strikethrough: `~~`, a non-blank character, and the next `~~` not preceded by whitespace. */
function matchStrike(run: Run, index: number, links: boolean, context: Context): Construct | undefined {
  const first = run.text.charAt(index + 2);
  if (!isTildes(run.text, run.literal, index) || first === "" || isWhitespace(first)) return undefined;
  const close = isTildes(run.text, run.literal, index + 2) ? index + 2 : firstFrom(run.closers, index + 3);
  if (close === undefined) return undefined;
  const node: MarkdownNode = { type: "delete", children: scan(nodesIn(run, index + 2, close, context), context, links) };
  return { nodes: [node], end: close + 2 };
}

/** What follows a reference's `]` for remark-parse 5: nothing, an unclosed `[`, `[]`, or `[identifier]`. */
type ReferenceSuffix = "none" | "unclosed" | "collapsed" | "full";

/**
 * Where remark-parse 5's reference ends after its `]`: past whitespace, `[`, an identifier without brackets and `]`. An
 * identifier that never closes still took the whitespace and the `[`.
 */
function referenceSuffix(run: Run, close: number): readonly [end: number, suffix: ReferenceSuffix] {
  let index = close + 1;
  while (isWhitespace(run.text.charAt(index))) index++;
  if (!isLiteralCharacter(run, index, "[")) return [close + 1, "none"];
  const opener = index;
  for (index = opener + 1; index < run.text.length; index++) {
    if (BRACKET_NODES.has(segmentAt(run, index)?.node.type ?? "")) break;
    if (isLiteralCharacter(run, index, "]")) return [index + 1, index === opener + 1 ? "collapsed" : "full"];
    if (isLiteralCharacter(run, index, "[")) break;
  }
  return [opener + 1, "unclosed"];
}

/**
 * Bracketed text that CommonMark left as text (no definition names it), read with remark-parse 5's reference rule: a
 * `[` not preceded by `!`, its closing `]`, and an optional `[identifier]` after optional whitespace. Without anything
 * after it the label must not be empty, and only a non-empty identifier allows brackets in the label. Today it became
 * a link to the current page; it now renders its label's text without the brackets and without a link (P-10). The
 * label is read as link text was, so nothing in it becomes a link.
 */
function matchReference(run: Run, index: number, context: Context): Construct | undefined {
  if (!isLiteralCharacter(run, index, "[") || isLiteralCharacter(run, index - 1, "!")) return undefined;
  const close = run.bracketClose[index] ?? -1;
  if (close < 0) return undefined;
  const [end, suffix] = referenceSuffix(run, close);
  const bracketed = (run.nextOpen[index + 1] ?? run.text.length) < close;
  if ((suffix !== "full" && bracketed) || (suffix === "none" && close === index + 1)) return undefined;
  return { nodes: scan(nodesIn(run, index + 1, close, context), context, false), end };
}

/**
 * Turns literal URLs and undefined references (when `links`) and strikethrough among inline siblings into nodes, left
 * to right.
 */
function scan(children: MarkdownNode[], context: Context, links: boolean): MarkdownNode[] {
  const run = buildRun(children, context);
  const result: MarkdownNode[] = [];
  let emitted = 0;
  let runStart = 0;
  let index = 0;
  while (index < run.text.length) {
    const segment = segmentAt(run, index);
    if (segment !== undefined && segment.kind !== "text") {
      index = runStart = segment.end;
      continue;
    }
    const construct = links
      ? (matchUrl(run, index, index === runStart, context) ?? matchStrike(run, index, links, context) ?? matchReference(run, index, context))
      : matchStrike(run, index, links, context);
    if (construct === undefined) {
      index++;
      continue;
    }
    result.push(...nodesIn(run, emitted, index, context), ...construct.nodes);
    index = emitted = runStart = construct.end;
  }
  if (emitted === 0) return children;
  result.push(...nodesIn(run, emitted, run.text.length, context));
  return result;
}

/** remark-parse 5 labels `<mailto:a@b.co>` as `a@b.co`; CommonMark keeps the scheme. */
function relabelMailAutolink(link: MarkdownNode, context: Context): void {
  const [label] = link.children ?? [];
  const url = link.url ?? "";
  if (link.children?.length !== 1 || label?.type !== "text" || label.value !== url || !url.toLowerCase().startsWith(MAILTO)) return;
  if (rawSource(link, context)?.startsWith("<") !== true) return;
  link.children = [sliceText(label, MAILTO.length, url.length, context)];
}

function transformPhrasing(children: MarkdownNode[], context: Context, links: boolean): MarkdownNode[] {
  for (const child of children) {
    if (child.children === undefined) continue;
    const isLink = child.type === "link" || child.type === "linkReference";
    if (child.type === "link") relabelMailAutolink(child, context);
    child.children = transformPhrasing(child.children, context, links && !isLink);
  }
  return scan(children, context, links);
}

// --- Tables ---------------------------------------------------------------------------------------------------------

interface Line {
  readonly nodes: MarkdownNode[];
  /** The hard break that ended the line, if any. */
  readonly ending?: MarkdownNode;
}

/** A text node cut at its line endings: the pieces of each line, empty pieces left out. */
function textLines(node: MarkdownNode, context: Context): MarkdownNode[][] {
  const value = node.value ?? "";
  const lines: MarkdownNode[][] = [];
  let from = 0;
  for (let newline = value.indexOf("\n"); newline !== -1; newline = value.indexOf("\n", from)) {
    lines.push(newline > from ? [sliceText(node, from, newline, context)] : []);
    from = newline + 1;
  }
  if (from === 0) lines.push([node]);
  else lines.push(from < value.length ? [sliceText(node, from, value.length, context)] : []);
  return lines;
}

/** A paragraph's inline children cut into its source lines; `undefined` when an inline node spans lines. */
function splitLines(children: readonly MarkdownNode[], context: Context): Line[] | undefined {
  const lines: Line[] = [];
  let nodes: MarkdownNode[] = [];
  for (const node of children) {
    if (node.type === "break") {
      lines.push({ nodes, ending: node });
      nodes = [];
    } else if (node.type === "text") {
      const [first = [], ...others] = textLines(node, context);
      nodes.push(...first);
      for (const pieces of others) {
        lines.push({ nodes });
        nodes = pieces;
      }
    } else if (rawSource(node, context)?.includes("\n") === true) {
      return undefined;
    } else {
      nodes.push(node);
    }
  }
  lines.push({ nodes });
  return lines;
}

function lineText(line: Line, context: Context): string {
  return line.nodes.map((node) => (node.type === "text" ? (node.value ?? "") : (rawSource(node, context) ?? UNKNOWN_SOURCE))).join("");
}

/** remark-parse 5 took a line as a table row when it has a pipe after its first character. */
function isRow(line: Line, context: Context): boolean {
  return lineText(line, context).includes("|", 1);
}

interface AlignmentState {
  readonly align: readonly TableAlign[];
  /** The column being read; `false` before its first dash or colon. */
  readonly alignment: TableAlign | false;
  readonly hasDash: boolean;
  readonly first: boolean;
}

/** A pipe of the alignment row closes the column being read; an empty column is allowed only before the first pipe. */
function closeColumn({ align, alignment, first }: AlignmentState): AlignmentState | undefined {
  if (alignment === false) return first ? { align, alignment, hasDash: false, first: false } : undefined;
  return { align: [...align, alignment], alignment: false, hasDash: false, first: false };
}

/** One character of remark-parse 5's alignment row; `undefined` when the row is not one. */
function readAlignment(state: AlignmentState, character: string): AlignmentState | undefined {
  const { alignment, hasDash } = state;
  if (character === "|") return closeColumn(state);
  if (character === "-") return { ...state, hasDash: true, alignment: alignment === false ? null : alignment };
  if (character === ":") {
    if (alignment === "left") return { ...state, alignment: "center" };
    return { ...state, alignment: hasDash && alignment === null ? "right" : "left" };
  }
  return isWhitespace(character) ? state : undefined;
}

/** remark-parse 5's alignment row: pipes, dashes, colons and blanks, no empty column between two pipes. */
function parseAlignment(line: Line, context: Context): TableAlign[] | undefined {
  if (line.nodes.some((node) => node.type !== "text")) return undefined;
  let state: AlignmentState | undefined = { align: [], alignment: false, hasDash: false, first: true };
  for (const character of lineText(line, context)) {
    state = readAlignment(state, character);
    if (state === undefined) return undefined;
  }
  const align = state.alignment === false ? [...state.align] : [...state.align, state.alignment];
  return align.length === 0 ? undefined : align;
}

function isBlank(nodes: readonly MarkdownNode[]): boolean {
  return nodes.every((node) => node.type === "text" && (node.value ?? "").trim() === "");
}

function trimCell(nodes: MarkdownNode[], context: Context): MarkdownNode[] {
  const cell = [...nodes];
  const head = cell[0];
  if (head?.type === "text") {
    const value = head.value ?? "";
    cell[0] = sliceText(head, value.length - value.trimStart().length, value.length, context);
  }
  const tail = cell.at(-1);
  if (tail?.type === "text") cell[cell.length - 1] = sliceText(tail, 0, (tail.value ?? "").trimEnd().length, context);
  return cell.filter((node) => node.type !== "text" || node.value !== "");
}

/** A row's cells: split at literal pipes, without the leading pipe and an empty cell after the trailing one. */
function rowCells(line: Line, context: Context): MarkdownNode[][] {
  const cells: MarkdownNode[][] = [];
  let cell: MarkdownNode[] = [];
  for (const node of line.nodes) {
    if (node.type !== "text") {
      cell.push(node);
      continue;
    }
    const value = node.value ?? "";
    const escaped = escapesOf(node, context);
    let from = 0;
    for (let index = 0; index < value.length; index++) {
      if (value.charAt(index) !== "|" || escaped[index] === true) continue;
      cell.push(sliceText(node, from, index, context));
      cells.push(cell);
      cell = [];
      from = index + 1;
    }
    cell.push(sliceText(node, from, value.length, context));
  }
  cells.push(cell);
  if (cells.length > 1 && isBlank(cells[0] ?? [])) cells.shift();
  if (cells.length > 1 && isBlank(cells.at(-1) ?? [])) cells.pop();
  return cells.map((nodes) => trimCell(nodes, context));
}

function joinLines(lines: readonly Line[], context: Context): MarkdownNode[] {
  return lines.flatMap((line, index) => {
    if (index === lines.length - 1) return line.nodes;
    return [...line.nodes, line.ending ?? textNode("\n", [false], context)];
  });
}

/** A paragraph that starts with a table, as the table and the paragraph of the lines after it. */
function splitTable(paragraph: MarkdownNode, context: Context): MarkdownNode[] {
  const lines = splitLines(paragraph.children ?? [], context);
  const [header, delimiter] = lines ?? [];
  if (lines === undefined || header === undefined || delimiter === undefined) return [paragraph];
  if (!isRow(header, context) || !isRow(delimiter, context)) return [paragraph];
  const align = parseAlignment(delimiter, context);
  if (align === undefined) return [paragraph];
  let end = 2;
  while (end < lines.length && isRow(lines[end] ?? { nodes: [] }, context)) end++;
  const rows = [header, ...lines.slice(2, end)].map((line) => rowCells(line, context));
  const columns = Math.max(align.length, ...rows.map((cells) => cells.length));
  const table: MarkdownNode = {
    type: "table",
    align: Array.from({ length: columns }, (_, index) => align[index] ?? null),
    children: rows.map((cells) => ({ type: "tableRow", children: cells.map((cell) => ({ type: "tableCell", children: cell })) })),
  };
  const rest = lines.slice(end);
  return rest.length === 0 ? [table] : [table, { type: "paragraph", children: joinLines(rest, context) }];
}

// --- Blocks ---------------------------------------------------------------------------------------------------------

/** remark-parse 5's task item: `[ ]`, `[x]` or `[X]` and a blank at the start of a list item. */
function markTask(item: MarkdownNode, context: Context): void {
  const [paragraph] = item.children ?? [];
  const [head, ...rest] = paragraph?.type === "paragraph" ? (paragraph.children ?? []) : [];
  if (paragraph === undefined || head?.type !== "text") return;
  const marker = TASK_MARKER.exec(head.value ?? "");
  if (marker === null || escapesOf(head, context).slice(0, marker[0].length).includes(true)) return;
  item.checked = marker[1]?.toLowerCase() === "x";
  const remainder = sliceText(head, marker[0].length, (head.value ?? "").length, context);
  paragraph.children = remainder.value === "" ? rest : [remainder, ...rest];
}

function transformBlock(node: MarkdownNode, context: Context): void {
  if (node.children === undefined) return;
  if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") {
    node.children = transformPhrasing(node.children, context, true);
    return;
  }
  node.children = node.children.flatMap((child) => (child.type === "paragraph" ? splitTable(child, context) : [child]));
  if (node.type === "listItem") markTask(node, context);
  for (const child of node.children) transformBlock(child, context);
}

/** The remark plugin: `remarkPlugins={[remarkLegacyGfm]}`. */
export function remarkLegacyGfm() {
  return (tree: MarkdownNode, file: { readonly value: unknown }): void => {
    transformBlock(tree, { source: typeof file.value === "string" ? file.value : "", escaped: new WeakMap() });
  };
}
